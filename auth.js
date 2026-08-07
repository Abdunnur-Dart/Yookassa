import { auth } from './firebase-init.js'; // импорт из файла выше
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";

// Регистрация нового пользователя
async function register(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    console.log("Пользователь создан:", userCredential.user);
  } catch (error) {
    console.error("Ошибка регистрации:", error.message);
  }
}

// Вход существующего пользователя
async function login(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("Вход выполнен:", userCredential.user);
  } catch (error) {
    console.error("Ошибка входа:", error.message);
  }
}
