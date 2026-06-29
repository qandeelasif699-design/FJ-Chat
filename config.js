import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAs48_PtELYEycTpQa9tuw3_surID84UnA",
  authDomain: "candle-web-chat.firebaseapp.com",
  projectId: "candle-web-chat",
  storageBucket: "candle-web-chat.firebasestorage.app",
  messagingSenderId: "630912601509",
  appId: "1:630912601509:web:c56b622df6e993e7442c4c"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);