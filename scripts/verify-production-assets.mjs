const baseUrl = process.argv[2] || process.env.HOSTINGER_APP_URL;
const expectedRelease = process.argv[3] || process.env.EXPECTED_RELEASE || process.env.GITHUB_SHA?.slice(0, 12);

if (!baseUrl) throw new Error("Production asset verification requires HOSTINGER_APP_URL or a base URL argument");
if (!expectedRelease) throw new Error("Production asset verification requires an expected release SHA");

const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
const manifestUrl = new URL("deployment-assets.json", base);
manifestUrl.searchParams.set("expected", expectedRelease);
manifestUrl.searchParams.set("ts", String(Date.now()));

const manifestResponse = await fetch(manifestUrl, {
  cache: "no-store",
  headers: { "cache-control": "no-cache, no-store" },
  redirect: "follow",
});
if (!manifestResponse.ok) {
  throw new Error(`Deployment asset manifest returned HTTP ${manifestResponse.status}: ${manifestUrl}`);
}

const contentType = manifestResponse.headers.get("content-type") || "";
if (!/application\/json|text\/json/i.test(contentType)) {
  throw new Error(`Deployment asset manifest has unexpected MIME type ${JSON.stringify(contentType)}`);
}

const manifest = await manifestResponse.json();
if (manifest?.release !== expectedRelease) {
  throw new Error(`Deployment asset manifest is for ${manifest?.release || "unknown"}, expected ${expectedRelease}`);
}
if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
  throw new Error("Deployment asset manifest contains no static assets");
}

const failures = [];
const concurrency = 12;
let cursor = 0;

await Promise.all(Array.from({ length: Math.min(concurrency, manifest.assets.length) }, async () => {
  while (true) {
    const index = cursor++;
    if (index >= manifest.assets.length) return;
    const asset = manifest.assets[index];
    try {
      await verifyAsset(asset);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
}));

if (failures.length > 0) {
  console.error(`Production static asset verification failed for ${failures.length}/${manifest.assets.length} assets:`);
  for (const failure of failures.slice(0, 30)) console.error(`- ${failure}`);
  if (failures.length > 30) console.error(`- ...and ${failures.length - 30} more failures`);
  process.exit(1);
}

console.log(`Production static asset verification passed for release ${expectedRelease}: ${manifest.assets.length} JS/CSS assets are reachable with valid MIME types.`);

async function verifyAsset(assetPath) {
  if (typeof assetPath !== "string" || !assetPath.startsWith("/_next/static/")) {
    throw new Error(`Invalid asset path in manifest: ${JSON.stringify(assetPath)}`);
  }

  const assetUrl = new URL(assetPath, base);
  assetUrl.searchParams.set("dpl", expectedRelease);
  assetUrl.searchParams.set("integrity_check", expectedRelease);

  let response = await fetch(assetUrl, {
    method: "HEAD",
    cache: "no-store",
    headers: { "cache-control": "no-cache, no-store" },
    redirect: "follow",
  });

  if (response.status === 405 || response.status === 501) {
    response = await fetch(assetUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        "cache-control": "no-cache, no-store",
        range: "bytes=0-0",
      },
      redirect: "follow",
    });
  }

  if (!(response.ok || response.status === 206)) {
    throw new Error(`${assetPath} returned HTTP ${response.status}`);
  }

  const type = response.headers.get("content-type") || "";
  if (/\.js$/i.test(assetPath) && !/(?:application|text)\/(?:javascript|x-javascript|ecmascript)/i.test(type)) {
    throw new Error(`${assetPath} returned non-executable MIME type ${JSON.stringify(type)}`);
  }
  if (/\.css$/i.test(assetPath) && !/text\/css/i.test(type)) {
    throw new Error(`${assetPath} returned non-CSS MIME type ${JSON.stringify(type)}`);
  }
}
