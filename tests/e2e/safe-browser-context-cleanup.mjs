import puppeteer from "puppeteer-core";

const pageCloseTimeout = 5_000;
const browserCloseTimeout = 15_000;
const autoDismissSeasonalGreeting =
  process.env.HOAHUB_E2E_PRESERVE_SEASONAL_GREETING !== "1" &&
  !(process.env.HOAHUB_E2E_BROWSER || "").trim();

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

async function closeBrowserSafely(browser, closeBrowser, label) {
  const closed = await settleWithin(closeBrowser(), label, browserCloseTimeout);
  if (!closed) browser.process()?.kill("SIGKILL");
}

const originalLaunch = puppeteer.launch.bind(puppeteer);

Object.defineProperty(puppeteer, "launch", {
  configurable: true,
  value: async (...launchArguments) => {
    const browser = await originalLaunch(...launchArguments);
    const originalBrowserClose = browser.close.bind(browser);
    const originalBrowserNewPage = browser.newPage.bind(browser);
    const isolatedBrowsers = new Set();

    Object.defineProperty(browser, "newPage", {
      configurable: true,
      value: async (...pageArguments) => {
        const page = await originalBrowserNewPage(...pageArguments);
        if (autoDismissSeasonalGreeting) {
          await page.evaluateOnNewDocument(() => {
            const installSeasonalGreetingDismissal = () => {
              const dismiss = () => {
                const close = document.querySelector('button[aria-label="Close seasonal greeting"]');
                if (close instanceof HTMLButtonElement) {
                  close.click();
                  return true;
                }
                return false;
              };
              dismiss();
              const root = document.documentElement;
              if (root) new MutationObserver(dismiss).observe(root, { childList: true, subtree: true });
              let attempts = 0;
              const retry = window.setInterval(() => {
                attempts += 1;
                dismiss();
                if (attempts >= 100) window.clearInterval(retry);
              }, 100);
            };
            if (document.readyState === "loading") {
              document.addEventListener("DOMContentLoaded", installSeasonalGreetingDismissal, { once: true });
            } else {
              installSeasonalGreetingDismissal();
            }
          });
        }
        return page;
      },
    });

    Object.defineProperty(browser, "createBrowserContext", {
      configurable: true,
      value: async (...contextArguments) => {
        if (contextArguments.length > 0) {
          throw new Error(
            "Controlled Chromium isolation does not support BrowserContext options; use a dedicated browser launch option instead.",
          );
        }

        const isolatedBrowser = await originalLaunch(...launchArguments);
        const isolatedBrowserClose = isolatedBrowser.close.bind(isolatedBrowser);
        const context = isolatedBrowser.defaultBrowserContext();
        isolatedBrowsers.add(isolatedBrowser);

        const originalNewPage = context.newPage.bind(context);
        Object.defineProperty(context, "newPage", {
          configurable: true,
          value: async (...pageArguments) => {
            const page = await originalNewPage(...pageArguments);
            if (autoDismissSeasonalGreeting) {
              await page.evaluateOnNewDocument(() => {
                const installSeasonalGreetingDismissal = () => {
                  const dismiss = () => {
                    const close = document.querySelector('button[aria-label="Close seasonal greeting"]');
                    if (close instanceof HTMLButtonElement) {
                      close.click();
                      return true;
                    }
                    return false;
                  };
                  // React may insert the client-only greeting before delegated click
                  // handlers are fully ready. Keep retrying briefly so non-seasonal
                  // CI suites deterministically dismiss the intentional post-login
                  // modal without changing product behavior.
                  dismiss();
                  const root = document.documentElement;
                  if (root) new MutationObserver(dismiss).observe(root, { childList: true, subtree: true });
                  let attempts = 0;
                  const retry = window.setInterval(() => {
                    attempts += 1;
                    dismiss();
                    if (attempts >= 100) window.clearInterval(retry);
                  }, 100);
                };
                if (document.readyState === "loading") {
                  document.addEventListener("DOMContentLoaded", installSeasonalGreetingDismissal, { once: true });
                } else {
                  installSeasonalGreetingDismissal();
                }
              });
            }
            return page;
          },
        });

        Object.defineProperty(context, "close", {
          configurable: true,
          value: async () => {
            await closeContextPages(context);
            isolatedBrowsers.delete(isolatedBrowser);
            await closeBrowserSafely(
              isolatedBrowser,
              isolatedBrowserClose,
              "isolated browser close",
            );
          },
        });

        return context;
      },
    });

    Object.defineProperty(browser, "close", {
      configurable: true,
      value: async () => {
        const remainingBrowsers = [...isolatedBrowsers];
        isolatedBrowsers.clear();
        await Promise.allSettled(
          remainingBrowsers.map((isolatedBrowser, index) =>
            closeBrowserSafely(
              isolatedBrowser,
              isolatedBrowser.close.bind(isolatedBrowser),
              `orphan isolated browser ${index + 1} close`,
            ),
          ),
        );
        await closeBrowserSafely(browser, originalBrowserClose, "browser close");
      },
    });

    return browser;
  },
});
