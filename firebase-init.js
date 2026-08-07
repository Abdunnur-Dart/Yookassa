import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth"; // Импортируем Auth

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
export const auth = getAuth(app); // Экспортируем auth для использования
