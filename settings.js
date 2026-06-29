import { auth, db } from "./config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const fileInput  = document.getElementById("fileInput");
const nameInput  = document.getElementById("nameInput");
const profilePic = document.getElementById("profilePic");
const saveBtn    = document.getElementById("saveBtn");
const logoutBtn  = document.getElementById("logoutBtn");

// ✅ localStorage se chatUID BILKUL mat uthao settings mein
// Sirf auth ka user.uid use karo
let myUID   = null;
let myEmail = null;

onAuthStateChanged(auth, async user => {
  if(!user){
    window.location.href = "index.html";
    return;
  }

  // Yeh APNA uid hai — Firebase Auth ne diya
  myUID   = user.uid;
  myEmail = user.email;

  // ✅ localStorage ka chatUID settings mein use NAHI hoga
  // Clear kar do taake koi confusion na ho
  // localStorage se sirf chat ke liye chatUID use hota hai

  console.log("=== SETTINGS PAGE ===");
  console.log("Logged in user:", myEmail);
  console.log("Logged in UID:", myUID);
  console.log("chatUID in localStorage:", localStorage.getItem("chatUID"));

  // ✅ Sirf myUID se data fetch karo
  const userDoc = doc(db, "users", myUID);
  const snap = await getDoc(userDoc);

  if(snap.exists()){
    const d = snap.data();
    console.log("Firestore se data:", d);
    nameInput.value = d.name || "";
    if(d.photoURL && !d.photoURL.includes("imgur.com")){
      profilePic.src = d.photoURL;
    }
  } else {
    nameInput.value = (myEmail||"").split("@")[0];
  }
});

fileInput.addEventListener("change", ()=>{
  const file = fileInput.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    profilePic.src = reader.result;
    profilePic.dataset.newPhoto = reader.result;
  };
  reader.readAsDataURL(file);
});

saveBtn.addEventListener("click", async ()=>{
  if(!myUID){
    alert("Pehle login karo!");
    return;
  }

  const name = nameInput.value.trim();
  if(!name){
    alert("Naam likho!");
    return;
  }

  console.log("=== SAVE HO RAHA HAI ===");
  console.log("Email:", myEmail);
  console.log("UID:", myUID);
  console.log("Naam:", name);

  // ✅ Sirf myUID document update hoga
  const updateData = {
    uid:   myUID,
    email: myEmail || "",
    name:  name
  };

  if(profilePic.dataset.newPhoto){
    updateData.photoURL = profilePic.dataset.newPhoto;
  }

  try{
    await setDoc(doc(db, "users", myUID), updateData, { merge: true });
    console.log("Save successful for:", myUID);

    delete profilePic.dataset.newPhoto;

    const t = document.createElement("div");
    t.textContent = "✅ Profile save ho gaya!";
    t.style.cssText = "position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#25d366;color:white;padding:12px 24px;border-radius:20px;font-size:14px;z-index:99999;";
    document.body.appendChild(t);
    setTimeout(()=>t.remove(), 2500);
  }catch(e){
    console.log("Save error:", e);
    alert("Error: " + e.message);
  }
});

logoutBtn.addEventListener("click", ()=>{
  signOut(auth).then(()=> window.location.href = "index.html");
});