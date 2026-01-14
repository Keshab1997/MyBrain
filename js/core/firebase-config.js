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
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection, 
    addDoc, 
    getDocs,
    doc,
    deleteDoc,
    query,
    where
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

// নতুন অফলাইন সাপোর্ট (ফায়ারবেস v10+ এর জন্য)
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ 
        tabManager: persistentMultipleTabManager() 
    })
});

const provider = new GoogleAuthProvider();

export { 
    app, auth, db, provider, 
    signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut,
    collection, addDoc, getDocs, doc, deleteDoc, query, where
};