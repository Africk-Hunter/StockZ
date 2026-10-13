// Module-loader hooks: any https://www.gstatic.com/firebasejs/... import resolves
// to a stub module that re-exports from the shared fake (globalThis.__firebase).
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("https://www.gstatic.com/firebasejs/")) {
    return { url: `stub:${specifier.split("/").pop()}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

const STUBS = {
  "firebase-app.js": `export const initializeApp = (...a) => globalThis.__firebase.initializeApp(...a);`,
  "firebase-auth.js": `
    export const getAuth = (...a) => globalThis.__firebase.getAuth(...a);
    export const signInWithEmailAndPassword = (...a) => globalThis.__firebase.signInWithEmailAndPassword(...a);
    export const signOut = (...a) => globalThis.__firebase.signOut(...a);`,
  "firebase-firestore.js": `
    export const getFirestore = (...a) => globalThis.__firebase.getFirestore(...a);
    export const collection = (...a) => globalThis.__firebase.collection(...a);
    export const setDoc = (...a) => globalThis.__firebase.setDoc(...a);
    export const getDocs = (...a) => globalThis.__firebase.getDocs(...a);
    export const doc = (...a) => globalThis.__firebase.doc(...a);
    export const deleteDoc = (...a) => globalThis.__firebase.deleteDoc(...a);
    export const updateDoc = (...a) => globalThis.__firebase.updateDoc(...a);
    export const writeBatch = (...a) => globalThis.__firebase.writeBatch(...a);
    export const arrayRemove = (...a) => globalThis.__firebase.arrayRemove(...a);`,
};

export async function load(url, context, nextLoad) {
  if (url.startsWith("stub:")) {
    return { format: "module", shortCircuit: true, source: STUBS[url.slice(5)] };
  }
  return nextLoad(url, context);
}
