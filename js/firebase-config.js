// js/firebase-config.js

// আপনার অনুরোধ অনুযায়ী 12.7.0 ভার্সন ব্যবহার করা হয়েছে
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDnXqLbGRyaOqP58edPaS5uut1dxDyDSQU",
  authDomain: "mybrain-1df31.firebaseapp.com",
  projectId: "mybrain-1df31",
  storageBucket: "mybrain-1df31.firebasestorage.app",
  messagingSenderId: "202677633038",
  appId: "1:202677633038:web:dded22e77062462a383c5f",
  measurementId: "G-JS89ND0VJR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ⚠️ FIXED: এখানে 'app' এক্সপোর্ট করা হয়েছে, যা আগে মিসিং ছিল
export { app, auth, db, storage };