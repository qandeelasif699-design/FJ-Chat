import { auth, db } from "./config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, doc, updateDoc, getDocs, writeBatch, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// DOM
const chatBox      = document.getElementById("chatBox");
const msgInput     = document.getElementById("msgInput");
const sendBtn      = document.getElementById("sendBtn");
const fileBtn      = document.getElementById("fileBtn");
const fileInput    = document.getElementById("fileInput");
const emojiBtn     = document.getElementById("emojiBtn");
const voiceBtn     = document.getElementById("voiceBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const msgMenu      = document.getElementById("msgMenu");
const editMsgBtn   = document.getElementById("editMsgBtn");
const deleteMeBtn  = document.getElementById("deleteMeBtn");
const deleteAllBtn = document.getElementById("deleteAllBtn");

// State
let currentUID  = null;
let currentUser = null;
let chatId      = null;
let selId       = null;
let selType     = null;
let selMine     = false;
let recorder    = null;
let chunks      = [];
let recording   = false;
let recToast    = null;
let unsub       = null;
let unsubTyping = null;
let clearedAt   = null;
let emojiOpen   = false;
let emojiEl     = null;
let typingTimer = null;

const otherUID  = localStorage.getItem("chatUID")  || "";
const chatName  = localStorage.getItem("chatName") || "User";
const chatPhoto = localStorage.getItem("chatPhoto")|| "";

document.getElementById("chatUser").textContent = chatName;
if(chatPhoto) document.getElementById("chatPhoto").src = chatPhoto;

const EMOJIS = ["😀","😁","😂","🤣","😊","😍","🥰","😎","😭","😢","😅","🤔","😏","🙄","😤",
  "🥳","🤩","😇","🤗","😋","👍","👎","❤️","🔥","✅","🎉","💯","🙏","👏","💪",
  "😴","🤤","😷","🤧","🥺","😬","🤯","🥱","😈","👻","🐶","🐱","🐸","🦊","🐼",
  "🦁","🐯","🐨","🐮","🐷"];

const REACTIONS = ["❤️","😂","😮","😢","👍","👎"];

function getTime(){
  return new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
}
function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function scrollBot(){ chatBox.scrollTop = chatBox.scrollHeight; }
function mkChatId(a,b){ return [a,b].sort().join("_"); }

function toast(msg, dur){
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText = "position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#2a3942;color:white;padding:10px 20px;border-radius:20px;font-size:13px;z-index:99999;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4);";
  document.body.appendChild(t);
  if(dur > 0) setTimeout(()=>t.remove(), dur);
  return t;
}

function tick(seen){
  return '<span style="color:' + (seen ? '#53bdeb' : '#8696a0') + ';font-size:12px;margin-left:2px;">✓✓</span>';
}

// ── Online Status ─────────────────────────────────────────
function updateOnlineStatus(online){
  if(!currentUID) return;
  setDoc(doc(db,"users",currentUID),{
    online: online,
    lastSeen: serverTimestamp()
  },{merge:true});
}

function listenOtherStatus(){
  if(!otherUID) return;
  onSnapshot(doc(db,"users",otherUID), snap => {
    if(!snap.exists()) return;
    const data = snap.data();
    const statusEl = document.querySelector(".user-info p");
    if(!statusEl) return;
    if(data.online){
      statusEl.textContent = "Online";
      statusEl.style.color = "#25d366";
    } else {
      let lastSeen = "Offline";
      if(data.lastSeen){
        const date = data.lastSeen.toDate ? data.lastSeen.toDate() : new Date();
        const now  = new Date();
        const diff = Math.floor((now - date) / 60000);
        const timeStr = date.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
        const dateStr = date.toLocaleDateString([], {day:"2-digit", month:"2-digit"});
        if(diff < 1)         lastSeen = "Abhi abhi";
        else if(diff < 1440) lastSeen = "Today " + timeStr;
        else if(diff < 2880) lastSeen = "Yesterday " + timeStr;
        else                 lastSeen = dateStr + " " + timeStr;
      }
      statusEl.textContent = "Last seen: " + lastSeen;
      statusEl.style.color = "#8696a0";
    }
  });
}

// ── Typing Indicator ──────────────────────────────────────
function setTyping(isTyping){
  if(!chatId || !currentUID) return;
  setDoc(doc(db,"chats",chatId,"typing",currentUID),{
    typing: isTyping,
    uid: currentUID
  },{merge:true});
}

function listenTyping(){
  if(!chatId || !otherUID) return;
  unsubTyping = onSnapshot(doc(db,"chats",chatId,"typing",otherUID), snap => {
    const statusEl = document.querySelector(".user-info p");
    if(!snap.exists() || !snap.data().typing){
      // Show online/offline status again
      listenOtherStatus();
      return;
    }
    if(statusEl){
      statusEl.textContent = "typing...";
      statusEl.style.color = "#25d366";
    }
  });
}

msgInput.addEventListener("input", ()=>{
  setTyping(true);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(()=> setTyping(false), 2000);
});

// ── Notifications ─────────────────────────────────────────
function requestNotifPermission(){
  if("Notification" in window && Notification.permission === "default"){
    Notification.requestPermission();
  }
}

function sendNotification(title, body){
  if("Notification" in window && Notification.permission === "granted"){
    if(document.hidden){
      new Notification(title, {
        body: body,
        icon: chatPhoto || "",
        badge: ""
      });
    }
  }
}

// ── Mark Seen ─────────────────────────────────────────────
async function markSeen(){
  if(!chatId || !currentUID) return;
  try{
    const snap = await getDocs(query(collection(db,"chats",chatId,"messages"), orderBy("timestamp","asc")));
    const batch = writeBatch(db);
    let has = false;
    snap.forEach(d => {
      const data = d.data();
      if(data.senderId !== currentUID && !data.seen){
        batch.update(doc(db,"chats",chatId,"messages",d.id),{seen:true});
        has = true;
      }
    });
    if(has) await batch.commit();
  }catch(e){}
}

// ── Auth ──────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if(!user){ window.location.href = "index.html"; return; }
  currentUser = user;
  currentUID  = user.uid;

  if(!otherUID){ chatBox.innerHTML = '<p style="color:#8696a0;text-align:center;padding:30px;">Koi user select nahi. <a href="home.html" style="color:#25d366">Wapas jao</a></p>'; return; }
  if(otherUID === currentUID){ window.location.href = "home.html"; return; }

  chatId = mkChatId(currentUID, otherUID);
  const saved = localStorage.getItem("clr_" + chatId + "_" + currentUID);
  if(saved) clearedAt = parseInt(saved);

  // Apna naam Firestore se lo
  getDoc(doc(db,"users",currentUID)).then(snap => {
    if(snap.exists() && snap.data().name){
      window._myName = snap.data().name;
    } else {
      window._myName = user.email.split("@")[0];
    }
  });

  // Online status set karo
  updateOnlineStatus(true);
  listenOtherStatus();
  listenTyping();
  requestNotifPermission();
  listen();

  // Page close/hide pe offline
  window.addEventListener("beforeunload", ()=> updateOnlineStatus(false));
  document.addEventListener("visibilitychange", ()=>{
    if(document.hidden){
      updateOnlineStatus(false);
      setTyping(false);
    } else {
      updateOnlineStatus(true);
      markSeen();
    }
  });
  window.addEventListener("focus", ()=>{ updateOnlineStatus(true); markSeen(); });
});

// ── Listen Messages ───────────────────────────────────────
function listen(){
  if(unsub) unsub();
  const q = query(collection(db,"chats",chatId,"messages"), orderBy("timestamp","asc"));
  let firstLoad = true;
  unsub = onSnapshot(q, snap => {
    chatBox.innerHTML = "";
    snap.forEach(d => {
      const msg = {id:d.id,...d.data()};
      if(clearedAt && msg.timestamp){
        const ms = msg.timestamp.toMillis ? msg.timestamp.toMillis() : 0;
        if(ms <= clearedAt) return;
      }
      renderMsg(msg);
    });
    scrollBot();
    markSeen();

    // Notification — sirf naye msgs pe (pehle load pe nahi)
    if(!firstLoad){
      const changes = snap.docChanges();
      changes.forEach(change => {
        if(change.type === "added"){
          const msg = change.doc.data();
          if(msg.senderId !== currentUID && msg.type === "text"){
            sendNotification(chatName, msg.content);
          }
        }
      });
    }
    firstLoad = false;
  });
}

// ── Render Message ────────────────────────────────────────
function renderMsg(msg){
  const isMine = msg.senderId === currentUID;
  const div = document.createElement("div");
  div.className = "message " + (isMine ? "sent" : "received");
  div.dataset.id = msg.id;

  if(msg.deleted){
    div.style.cssText = "opacity:0.5;font-style:italic;";
    div.innerHTML = "<span>🚫 Message delete ho gaya</span><span class='time'>" + (msg.time||"") + "</span>";
    chatBox.appendChild(div); return;
  }

  let inner = "";
  if(msg.type === "text")       inner = "<span>" + esc(msg.content) + "</span>";
  else if(msg.type === "image") inner = "<img src='" + msg.content + "' class='chat-image' style='cursor:pointer' onclick=\"window.open(this.src,'_blank')\">";
  else if(msg.type === "audio") inner = "<audio controls src='" + msg.content + "' style='max-width:220px;'></audio>";
  else if(msg.type === "file")  inner = "<a href='" + msg.content + "' target='_blank' style='color:#25d366;word-break:break-all;'>📄 " + esc(msg.fileName||"File") + "</a>";

  const nameTag = !isMine ? "<div style='font-size:11px;color:#25d366;margin-bottom:4px;font-weight:600;'>" + esc(msg.senderName||"User") + "</div>" : "";
  const t = isMine ? tick(msg.seen===true) : "";

  // Reactions display
  let reactionsHtml = "";
  if(msg.reactions && Object.keys(msg.reactions).length > 0){
    const counts = {};
    Object.values(msg.reactions).forEach(r => { counts[r] = (counts[r]||0)+1; });
    reactionsHtml = "<div style='margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;'>";
    Object.entries(counts).forEach(([emoji, count]) => {
      reactionsHtml += "<span style='background:#2a3942;border-radius:10px;padding:2px 6px;font-size:13px;cursor:pointer;' onclick=\"reactToMsg('" + msg.id + "','" + emoji + "')\">" + emoji + (count>1?" "+count:"") + "</span>";
    });
    reactionsHtml += "</div>";
  }

  div.innerHTML = nameTag + inner + reactionsHtml +
    "<span class='time'>" + (msg.time||"") + t + "</span>" +
    "<span class='msg-menu'>▾</span>";

  div.querySelector(".msg-menu").addEventListener("click", e => {
    e.stopPropagation();
    showCtx(e.clientX, e.clientY, msg.id, msg.type, isMine);
  });

  let pt;
  div.addEventListener("touchstart", ()=>{ pt = setTimeout(()=>{ const r=div.getBoundingClientRect(); showCtx(r.right-20,r.top+10,msg.id,msg.type,isMine); },600); });
  div.addEventListener("touchend", ()=>clearTimeout(pt));

  chatBox.appendChild(div);
}

// ── React to Message ──────────────────────────────────────
window.reactToMsg = async function(msgId, emoji){
  if(!chatId || !currentUID) return;
  const msgRef = doc(db,"chats",chatId,"messages",msgId);
  const field  = "reactions." + currentUID;
  await updateDoc(msgRef, {[field]: emoji});
};

function showReactionPicker(msgId){
  // Remove existing picker
  document.getElementById("reactionPicker")?.remove();

  const picker = document.createElement("div");
  picker.id = "reactionPicker";
  picker.style.cssText = "position:fixed;background:#202c33;border-radius:30px;padding:8px 12px;display:flex;gap:8px;z-index:99999;box-shadow:0 2px 15px rgba(0,0,0,.5);";

  REACTIONS.forEach(emoji => {
    const btn = document.createElement("button");
    btn.textContent = emoji;
    btn.style.cssText = "background:none;border:none;font-size:22px;cursor:pointer;padding:2px;border-radius:50%;";
    btn.onmouseenter = ()=>{ btn.style.transform="scale(1.3)"; };
    btn.onmouseleave = ()=>{ btn.style.transform="scale(1)"; };
    btn.onclick = ()=>{ reactToMsg(msgId, emoji); picker.remove(); };
    picker.appendChild(btn);
  });

  document.body.appendChild(picker);

  // Position
  const msgEl = document.querySelector('[data-id="' + msgId + '"]');
  if(msgEl){
    const r = msgEl.getBoundingClientRect();
    picker.style.left = Math.min(r.left, window.innerWidth - 280) + "px";
    picker.style.top  = (r.top - 55) + "px";
  }

  setTimeout(()=> document.addEventListener("click", ()=> picker.remove(), {once:true}), 100);
}

// ── Send ──────────────────────────────────────────────────
async function sendMsg(type, content, extra){
  if(!chatId || !currentUser) return;
  const data = {
    senderId:   currentUID,
    senderName: window._myName || currentUser.email.split("@")[0] || "User",
    type, content,
    time:      getTime(),
    timestamp: serverTimestamp(),
    deleted:   false,
    seen:      false
  };
  if(extra) Object.assign(data, extra);
  await addDoc(collection(db,"chats",chatId,"messages"), data);
  setTyping(false);
  clearTimeout(typingTimer);
}

function sendText(){
  const t = msgInput.value.trim();
  if(!t || !chatId) return;
  sendMsg("text", t);
  msgInput.value = "";
  if(emojiEl) emojiEl.style.display = "none";
  emojiOpen = false;
}

sendBtn.addEventListener("click", sendText);
msgInput.addEventListener("keydown", e => {
  if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); sendText(); }
});

// ── File ──────────────────────────────────────────────────
fileBtn.addEventListener("click", ()=> fileInput.click());
fileInput.addEventListener("change", ()=>{
  const file = fileInput.files[0];
  if(!file || !chatId) return;
  const t = toast("⏫ Upload ho raha hai...", 0);
  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const type = file.type.startsWith("image/") ? "image" : "file";
      await sendMsg(type, reader.result, type==="file" ? {fileName:file.name} : null);
      t.remove(); toast("✅ Bhej diya!", 2000);
    }catch(e){ t.remove(); toast("❌ " + e.message, 3000); }
  };
  reader.readAsDataURL(file);
  fileInput.value = "";
});

// ── Emoji ─────────────────────────────────────────────────
function buildEmoji(){
  if(emojiEl) return;
  emojiEl = document.createElement("div");
  emojiEl.style.cssText = "position:fixed;bottom:75px;right:15px;background:#202c33;border-radius:12px;padding:10px;display:grid;grid-template-columns:repeat(8,1fr);gap:6px;z-index:9999;box-shadow:0 0 15px rgba(0,0,0,.6);max-width:320px;";
  EMOJIS.forEach(e => {
    const b = document.createElement("button");
    b.textContent = e;
    b.style.cssText = "background:none;border:none;font-size:22px;cursor:pointer;padding:4px;border-radius:6px;";
    b.onclick = ()=>{ msgInput.value += e; msgInput.focus(); };
    emojiEl.appendChild(b);
  });
  document.body.appendChild(emojiEl);
}

emojiBtn.addEventListener("click", e => {
  e.stopPropagation();
  buildEmoji();
  emojiOpen = !emojiOpen;
  emojiEl.style.display = emojiOpen ? "grid" : "none";
});

document.addEventListener("click", e => {
  if(emojiEl && e.target !== emojiBtn && !emojiEl.contains(e.target)){
    emojiEl.style.display = "none";
    emojiOpen = false;
  }
});

// ── Voice ─────────────────────────────────────────────────
voiceBtn.addEventListener("click", async ()=>{
  if(!recording){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      recorder = new MediaRecorder(stream);
      chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = ()=>{
        const blob = new Blob(chunks,{type:"audio/webm"});
        const reader = new FileReader();
        reader.onload = async ()=>{ await sendMsg("audio", reader.result, null); };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t=>t.stop());
      };
      recorder.start();
      recording = true;
      voiceBtn.textContent = "⏹";
      voiceBtn.style.background = "#e74c3c";
      recToast = toast("🎙️ Recording... dobara click karo rok ne ke liye", 0);
    }catch{ toast("❌ Microphone access nahi mila", 3000); }
  } else {
    recorder.stop();
    recording = false;
    voiceBtn.textContent = "🎤";
    voiceBtn.style.background = "#25d366";
    if(recToast){ recToast.remove(); recToast = null; }
  }
});

// ── Context Menu ──────────────────────────────────────────
function showCtx(x, y, id, type, isMine){
  selId   = id;
  selType = type;
  selMine = isMine;

  // Add reaction button to context menu
  let reactBtn = document.getElementById("reactBtn");
  if(!reactBtn){
    reactBtn = document.createElement("button");
    reactBtn.id = "reactBtn";
    reactBtn.textContent = "😍 React karo";
    msgMenu.insertBefore(reactBtn, msgMenu.firstChild);
  }
  reactBtn.onclick = ()=>{ hideCtx(); showReactionPicker(id); };

  msgMenu.style.left    = Math.min(x, window.innerWidth  - 230) + "px";
  msgMenu.style.top     = Math.min(y, window.innerHeight - 160) + "px";
  msgMenu.style.display = "block";
  editMsgBtn.style.display   = (isMine && type==="text") ? "block" : "none";
  deleteAllBtn.style.display = isMine ? "block" : "none";
}
function hideCtx(){ msgMenu.style.display="none"; selId=null; }
document.addEventListener("click", hideCtx);
msgMenu.addEventListener("click", e => e.stopPropagation());

editMsgBtn.addEventListener("click", async ()=>{
  if(!selId) return hideCtx();
  const t = prompt("Message edit karo:");
  if(!t || !t.trim()) return hideCtx();
  await updateDoc(doc(db,"chats",chatId,"messages",selId),{content: t.trim() + " ✏️"});
  hideCtx();
});

deleteMeBtn.addEventListener("click", ()=>{
  document.querySelector('[data-id="' + selId + '"]')?.remove();
  hideCtx();
});

deleteAllBtn.addEventListener("click", async ()=>{
  if(!selId || !chatId) return hideCtx();
  await updateDoc(doc(db,"chats",chatId,"messages",selId),{deleted:true, content:null});
  hideCtx();
});

clearChatBtn.addEventListener("click", ()=>{
  const now = Date.now();
  clearedAt = now;
  localStorage.setItem("clr_" + chatId + "_" + currentUID, now.toString());
  chatBox.innerHTML = "";
  document.getElementById("menu").style.display = "none";
});