import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signInWithRedirect, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs,
    doc,
    deleteDoc,
    query,
    where,
    enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDnXqLbGRyaOqP58edPaS5uut1dxDyDSQU",
  authDomain: "mybrain-1df31.firebaseapp.com",
  projectId: "mybrain-1df31",
  storageBucket: "mybrain-1df31.firebasestorage.app",
  messagingSenderId: "202677633038",
  appId: "1:202677633038:web:dded22e77062462a383c5f",
  measurementId: "G-JS89ND0VJR"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// অফলাইন সাপোর্ট (যদি ব্রাউজার সাপোর্ট করে)
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.log('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
    } else if (err.code == 'unimplemented') {
        console.log('The current browser does not support all of the features required to enable persistence');
    }
});

export { 
    app, auth, db, provider, 
    signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut,
    collection, addDoc, getDocs, doc, deleteDoc, query, where
};