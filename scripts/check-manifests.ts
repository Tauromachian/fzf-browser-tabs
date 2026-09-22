//Fails `deno task check:manifests` when the per-browser manifests drift on
// fields that must stay identical. Browser-specific keys (background,
// commands.suggested_key, browser_specific_settings, minimum_chrome_version)
// are asserted separately below.
const firefox = JSON.parse(
  await Deno.readTextFile("manifests/manifest.firefox.json"),
);
const chrome = JSON.parse(
  await Deno.readTextFile("manifests/manifest.chrome.json"),
);

let failed = false;

function eq(path: string, a: unknown, b: unknown): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error(`manifest drift at ${path}:
  firefox: ${JSON.stringify(a)}
  chrome:  ${JSON.stringify(b)}`);
    failed = true;
  }
}

eq("name", firefox.name, chrome.name);
eq("version", firefox.version, chrome.version);
eq("description", firefox.description, chrome.description);
eq("permissions", firefox.permissions, chrome.permissions);
eq("host_permissions", firefox.host_permissions, chrome.host_permissions);
eq("content_scripts", firefox.content_scripts, chrome.content_scripts);
eq(
  "commands.open-tab-switcher.description",
  firefox.commands?.["open-tab-switcher"]?.description,
  chrome.commands?.["open-tab-switcher"]?.description,
);
eq(
  "commands.open-tab-switcher.suggested_key.default",
  firefox.commands?.["open-tab-switcher"]?.suggested_key?.default,
  chrome.commands?.["open-tab-switcher"]?.suggested_key?.default,
);

// Firefox-only keys.
for (const path of ["browser_specific_settings", "background.scripts"]) {
  const parts = path.split(".");
  let node: unknown = firefox;
  for (const part of parts) {
    node = (node as Record<string, unknown>)?.[part];
  }
  if (node === undefined) {
    console.error(`firefox manifest missing ${path}`);
    failed = true;
  }
}

// Chrome-only keys.
if (chrome.browser_specific_settings !== undefined) {
  console.error("chrome manifest must not contain browser_specific_settings");
  failed = true;
}
if (typeof chrome.background?.service_worker !== "string") {
  console.error("chrome manifest needs background.service_worker");
  failed = true;
}
if (typeof chrome.minimum_chrome_version !== "string") {
  console.error("chrome manifest needs minimum_chrome_version");
  failed = true;
}

if (failed) Deno.exit(1);
console.log("manifests OK");
