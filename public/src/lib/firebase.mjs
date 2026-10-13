// The one place that pins the Firebase SDK version/URLs and initializes the
// app. Everything else imports `auth`, `db` and the Firestore helpers from here.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getAuth, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { getFirestore, collection, setDoc, getDocs, doc, deleteDoc, updateDoc, writeBatch, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

const firebaseConfig = {
  apiKey: "AIzaSyAuxROpJhqJ4-fgIC4xwNYV5ycd0O_QCO4",
  authDomain: "stockz-1d5ca.firebaseapp.com",
  projectId: "stockz-1d5ca",
  storageBucket: "stockz-1d5ca.appspot.com",
  messagingSenderId: "853457963776",
  appId: "1:853457963776:web:0cae1e3883c0195f6681e5",
  measurementId: "G-80DCFJFT65"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export { signInWithEmailAndPassword, signOut, collection, setDoc, getDocs, doc, deleteDoc, updateDoc, writeBatch, arrayRemove };
