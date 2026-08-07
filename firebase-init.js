// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC9OMgbfUquAHAcNgUPqWPo07ntIWOupaY",
  authDomain: "tg-1-26d42.firebaseapp.com",
  projectId: "tg-1-26d42",
  storageBucket: "tg-1-26d42.firebasestorage.app",
  messagingSenderId: "1008887512826",
  appId: "1:1008887512826:web:3d95ae980dfa26415f9343",
  measurementId: "G-429GJLN9KD"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
