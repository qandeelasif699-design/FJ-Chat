import { auth, db } from "./config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const emailEl  = document.getElementById("email");
const passEl   = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const signupBtn= document.getElementById("signupBtn");
const errMsg   = document.getElementById("errMsg");

function showErr(m){
  errMsg.textContent = m;
  errMsg.style.display = "block";
  setTimeout(()=>{ errMsg.style.display="none"; }, 4000);
}

loginBtn.addEventListener("click", async ()=>{
  const e = emailEl.value.trim();
  const p = passEl.value.trim();
  if(!e||!p){ showErr("Email aur password likho!"); return; }
  try{
    await signInWithEmailAndPassword(auth, e, p);
    window.location.href = "home.html";
  }catch(err){ showErr(err.message); }
});

signupBtn.addEventListener("click", async ()=>{
  const e = emailEl.value.trim();
  const p = passEl.value.trim();
  if(!e||!p){ showErr("Email aur password likho!"); return; }
  try{
    const cred = await createUserWithEmailAndPassword(auth, e, p);
    await setDoc(doc(db,"users",cred.user.uid),{
      uid:      cred.user.uid,
      email:    cred.user.email,
      name:     e.split("@")[0],
      photoURL: ""
    });
    window.location.href = "home.html";
  }catch(err){ showErr(err.message); }
});