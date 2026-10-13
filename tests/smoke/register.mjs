// Preloaded (node --import) for smoke scenarios: swaps the Firebase CDN imports
// for the in-memory fakes in fake-firebase.mjs so the real page modules can run
// under Node.
import { register } from "node:module";

register("./stub-loader.mjs", import.meta.url);
