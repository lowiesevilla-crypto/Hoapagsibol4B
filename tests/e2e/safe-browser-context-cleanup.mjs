import puppeteer from "puppeteer-core";

const pageCloseTimeout = 5_000;
const browserCloseTimeout = 15_000;

async function settleWithin(promise, label, timeoutMs) {
  let timer;
  const completed = await Promise.race([
    Promise.resolve(promise).then(
      () => true,
      (error) => {
        console.log(`[browser:cleanup] ${label} failed: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      },
    ),
    new Promise((resolve) => {
      timer = setTimeout(() => {
        console.log(`[browser:cleanup] ${label} exceeded ${timeoutMs}ms; continuing best-effort cleanup.`);
        resolve(false);
      }, timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
  return completed;
}

async function closeContextPages(context) {
  let pages = [];
  try {
    pages = await context.pages();
  } catch (error) {
    console.log(`[browser:cleanup] Could not enumerate context pages: ${error instanceof Error ? error.message : String(error)}`);
  }
  await Promise.allSettled(
    pages.map((page, index) =>
      settleWithin(
        page.close({ runBeforeUnload: false }),
        `page ${index + 1} close`,
        pageCloseTimeout,
      ),
    ),
  );
}

const originalLaunch = puppeteer.launch.bind(puppeteer);

Object.defineProperty(puppeteer, "launch", {
  configurable: true,
  value: async (...launchArguments) => {
    const browser = await originalLaunch(...launchArguments);
    const originalCreateBrowserContext = browser.createBrowserContext.bind(browser);
    const originalBrowserClose = browser.close.bind(browser);

    Object.defineProperty(browser, "createBrowserContext", {
      configurable: true,
      value: async (...contextArguments) => {
        const context = await originalCreateBrowserContext(...contextArguments);
        Object.defineProperty(context, "close", {
          configurable: true,
          value: async () => {
            await closeContextPages(context);
          },
        });
        return context;
      },
    });

    Object.defineProperty(browser, "close", {
      configurable: true,
      value: async () => {
        const closed = await settleWithin(
          originalBrowserClose(),
          "browser close",
          browserCloseTimeout,
        );
        if (!closed) browser.process()?.kill("SIGKILL");
      },
    });

    return browser;
  },
});
