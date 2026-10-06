/* ============================== SECURITY CORE ==============================
 * Pesa runs on the owner's own devices, so these controls are enforced inside the app's data layer and in the
 * functions themselves, not only by hiding buttons. They protect against honest mistakes, curious staff and casual
 * tampering. They cannot stop someone who controls the browser itself; only per user cloud accounts and server side
 * rules can do that (see the Security status in Settings). */

/* ---- this device ---- */
var Dev = (function(){
  var id = '';
  try{ id = localStorage.getItem('pesa_device_id') || ''; }catch(e){}
  if(!/^d-[a-z0-9]{8,}$/.test(id)){
    id = 'd-' + String(uid()).replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase();
    try{ localStorage.setItem('pesa_device_id', id); }catch(e){}
  }
  return { id:function(){ return id; }, short:function(){ return id.slice(2, 6).toUpperCase(); } };
})();

/* ---- who is signed in, checked against the staff records (never only against the saved session) ---- */
function secRoleNow(){
  var s = State.session; if(!s) return null;
  var u = null;
  for(var i = 0; i < State.users.length; i++){ if(State.users[i].id === s.userId){ u = State.users[i]; break; } }
  if(u){ if(u.active === false) return null; return u.role || s.role || null; }
  return s.role || null;
}
var _secNoteAt = 0;
function secBlocked(what){
  try{
    logAudit('other', 'security', null, 'Blocked: ' + what + ' (signed in as ' + (secRoleNow() || 'nobody') + ')');
    if(Date.now() - _secNoteAt > 2500){ _secNoteAt = Date.now(); toast(tr('You do not have permission to do that.')); }
  }catch(e){}
}
function secAllow(level, what){
  var r = secRoleNow(), ok = false;
  if(level === 'owner') ok = r === 'owner';
  else if(level === 'manager') ok = r === 'owner' || r === 'manager';
  else ok = !!r;
  if(!ok) secBlocked(what || 'an action that needs ' + level + ' access');
  return ok;
}
/* ask again for the password or PIN before a high risk action (not asked twice within 90 seconds) */
var _reauthAt = 0;
function secReauth(reason, fn){
  if(Date.now() - _reauthAt < 90000){ fn(); return; }
  askPasswordSheet(reason || tr('Confirm with your password or PIN'), function(){ _reauthAt = Date.now(); fn(); });
}

/* ---- tamper evident audit log ----
   Every entry records the device, a counter for that device, the hash of the previous entry from that device and
   its own hash. Editing, removing or reordering an entry breaks the chain, and the Activity log says so. */
var AUDIT_TAIL_KEY = 'pesa_audit_tail_' + WS.id;
function auditCanon(e){
  return [e.dev, e.seq, e.prev, e.action, e.entityType, e.entityId || '', e.summary || '', e.userId || '', e.userName || '', e.createdAt].join('\u001f');
}
function auditStamp(e){
  var t = null; try{ t = JSON.parse(localStorage.getItem(AUDIT_TAIL_KEY) || 'null'); }catch(x){}
  var me = Dev.id();
  if(!t || t.dev !== me){
    t = { dev:me, seq:0, hash:'GENESIS' };
    (State.auditLog || []).forEach(function(a){ if(a.dev === me && a.seq > t.seq){ t.seq = a.seq; t.hash = a.hash; } });
  }
  e.dev = me; e.seq = t.seq + 1; e.prev = t.hash;
  e.hash = sha256Pure(auditCanon(e));
  try{ localStorage.setItem(AUDIT_TAIL_KEY, JSON.stringify({ dev:me, seq:e.seq, hash:e.hash })); }catch(x){}
  return e;
}
function auditVerify(){
  var by = {}, legacy = 0, problems = [];
  (State.auditLog || []).forEach(function(a){
    if(!a.hash || !a.seq){ legacy++; return; }
    (by[a.dev || '?'] = by[a.dev || '?'] || []).push(a);
  });
  var checked = 0;
  Object.keys(by).forEach(function(dev){
    var list = by[dev].slice().sort(function(a, b){ return a.seq - b.seq; }), prev = null;
    list.forEach(function(a){
      checked++;
      if(sha256Pure(auditCanon(a)) !== a.hash) problems.push('Entry ' + a.seq + ' from device ' + String(dev).slice(2, 6) + ' was changed');
      if(prev){
        if(a.seq === prev.seq) problems.push('Entry ' + a.seq + ' from device ' + String(dev).slice(2, 6) + ' appears twice');
        else if(a.seq !== prev.seq + 1) problems.push((a.seq - prev.seq - 1) + ' entries are missing after ' + prev.seq + ' on device ' + String(dev).slice(2, 6));
        if(a.prev !== prev.hash && a.seq === prev.seq + 1) problems.push('Entry ' + a.seq + ' from device ' + String(dev).slice(2, 6) + ' does not follow the one before it');
      }
      prev = a;
    });
  });
  return { ok:problems.length === 0, checked:checked, legacy:legacy, problems:problems };
}

/* ---- data layer protection (see Store.setGuard) ----
   Finalised financial records cannot be silently changed or deleted from anywhere in the app. Deleting from the
   records that may be removed needs a manager or the owner. Controlled routes (void, refund, archive) pass
   through guardRun. */
var _guardPass = 0;
function guardRun(fn){ _guardPass++; try{ return fn(); } finally { _guardPass--; } }
var GUARD_MANAGER_DELETE = ['expenses','supplierPayments','supplierInvoices','wastage','invoices','purchaseOrders','branches','suppliers','customers','payRuns','clockLogs','tips','quotes','stockTakes'];
var SALE_OPEN_KEYS = ['fiscalId', 'fiscalKey', 'receiptSentAt', 'receiptSent'];
function dataGuard(coll, op, id, existing, patch){
  if(_guardPass) return true;
  var role = secRoleNow();
  if(coll === 'auditLog' || coll === 'deletedRecords' || coll === 'syncLog'){
    if(op === 'set' && !existing) return true;
    secBlocked('changing the ' + coll + ' (it can only be added to)'); return false;
  }
  if(coll === 'sales'){
    if(op === 'delete'){ secBlocked('deleting a sale (use Refund or Void)'); return false; }
    if(op === 'set' && existing) return false;
    if(op === 'update' && patch){
      var bad = Object.keys(patch).filter(function(k){ return SALE_OPEN_KEYS.indexOf(k) < 0; });
      if(bad.length){ secBlocked('changing a completed sale (' + bad[0] + ')'); return false; }
    }
    return true;
  }
  if(coll === 'tillSessions'){
    if(op === 'delete'){ secBlocked('deleting a till session'); return false; }
    if(existing && existing.status === 'closed'){ secBlocked('changing a closed till session'); return false; }
    return true;
  }
  if(coll === 'accountingPeriods'){
    if(op === 'delete'){ secBlocked('deleting a filed accounting period'); return false; }
    return true;
  }
  if(coll === 'users' && existing && role){
    if(op === 'delete'){ if(role !== 'owner' || existing.role === 'owner'){ secBlocked('deleting a staff account'); return false; } return true; }
    if(patch){
      var isSelf = State.session && State.session.userId === id;
      if('role' in patch && patch.role !== existing.role && role !== 'owner'){ secBlocked('changing a role'); return false; }
      if(existing.role === 'owner' && !isSelf && role !== 'owner'){ secBlocked('changing the owner account'); return false; }
      if(existing.role === 'manager' && !isSelf && role !== 'owner' && ('passHash' in patch || 'active' in patch || 'role' in patch)){ secBlocked('changing a manager'); return false; }
      var touches = ('active' in patch && patch.active !== existing.active) || ('passHash' in patch) || ('role' in patch && patch.role !== existing.role);
      if(touches && !isSelf && role !== 'owner' && role !== 'manager'){ secBlocked('changing a staff account'); return false; }
    }
    return true;
  }
  if(op === 'delete' && role && GUARD_MANAGER_DELETE.indexOf(coll) > -1 && role !== 'owner' && role !== 'manager'){
    secBlocked('deleting from ' + coll); return false;
  }
  if(op === 'delete' && existing && GUARD_ARCHIVE.indexOf(coll) > -1) archiveRemoved(coll, id, existing);
  return true;
}
/* The original of a removed financial record is kept (who, when, why and a hash of its content). */
var GUARD_ARCHIVE = ['expenses','supplierPayments','supplierInvoices','wastage','invoices','purchaseOrders','payRuns','clockLogs','tips'];
var secDeleteReason = '';
/** Run a removal with the reason the person gave, so the archive and the activity log record it. */
function secWithReason(reason, fn){ var old = secDeleteReason; secDeleteReason = String(reason || '').slice(0, 200); try{ return fn(); } finally { secDeleteReason = old; } }
function archiveRemoved(coll, id, existing){
  try{
    var snap = JSON.parse(JSON.stringify(existing));
    var rec = { coll:coll, recId:id, data:snap, reason:secDeleteReason || '', deletedAt:new Date().toISOString(), by:State.session ? State.session.name : '', byId:State.session ? State.session.userId : '', dev:Dev.id(), hash:sha256Pure(JSON.stringify(snap)) };
    guardRun(function(){ refs.deletedRecords.add(rec); });
    logAudit('delete', 'archive', id, 'Removed ' + coll + ' record ' + String(id).slice(0, 6) + ' (original kept)' + (secDeleteReason ? ': ' + secDeleteReason : ''));
  }catch(e){}
}

/* ---- safe images and uploads ---- */
var SEC_IMG_MAX = 8 * 1024 * 1024, SEC_TEXT_MAX = 60 * 1024 * 1024;
function safeImg(src){
  var s = String(src == null ? '' : src);
  if(/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(s)) return s;
  if(/^blob:[A-Za-z0-9:\/\.\-]+$/.test(s)) return s;
  return '';
}
function safeAudio(src){
  var s = String(src == null ? '' : src);
  if(/^data:audio\/[a-z0-9.+\-]+(;codecs=[a-z0-9.,\-]+)?;base64,[A-Za-z0-9+\/=]+$/i.test(s)) return s;
  if(/^blob:[A-Za-z0-9:\/\.\-]+$/.test(s)) return s;
  return '';
}
function secImageKind(b){
  if(b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
  if(b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
  if(b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
  if(b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return '';
}
/** Resolves {ok, msg}. Looks at the real file contents, not the name or the type the browser reports. */
function secCheckImage(file){
  return new Promise(function(resolve){
    if(!file || typeof file.size !== 'number') return resolve({ ok:false, msg:tr('Choose a picture file.') });
    if(file.size > SEC_IMG_MAX) return resolve({ ok:false, msg:tr('That picture is too large. Choose one under 8 MB.') });
    if(file.size < 16) return resolve({ ok:false, msg:tr('That file is empty.') });
    var fr = new FileReader();
    fr.onload = function(){
      var kind = secImageKind(new Uint8Array(fr.result));
      resolve(kind ? { ok:true, kind:kind } : { ok:false, msg:tr('Only PNG, JPG, WebP or GIF pictures are allowed.') });
    };
    fr.onerror = function(){ resolve({ ok:false, msg:tr('That file could not be read.') }); };
    fr.readAsArrayBuffer(file.slice(0, 16));
  });
}
var SEC_BAD_EXT = /\.(exe|bat|cmd|com|scr|msi|dll|jar|apk|app|js|jse|mjs|vbs|vbe|ps1|psm1|sh|bash|php|py|rb|pl|html?|xhtml|svg|swf|hta|lnk|reg|iso|dmg)$/i;
function secCheckTextFile(file, maxBytes){
  if(!file) return { ok:false, msg:tr('Choose a file.') };
  if(SEC_BAD_EXT.test(String(file.name || ''))) return { ok:false, msg:tr('That type of file is not allowed.') };
  if(file.size > (maxBytes || SEC_TEXT_MAX)) return { ok:false, msg:tr('That file is too large.') };
  return { ok:true };
}
function secWrapImageFn(orig){
  return function(file){
    var args = arguments, self = this;
    if(!(file instanceof Blob)) return orig.apply(self, args);
    return secCheckImage(file).then(function(c){ if(!c.ok){ var e = new Error(c.msg); e.userMessage = c.msg; throw e; } return orig.apply(self, args); });
  };
}
squarePhoto = secWrapImageFn(squarePhoto);
resizeImageFile = secWrapImageFn(resizeImageFile);
logoLoadCanvas = secWrapImageFn(logoLoadCanvas);
// every text style upload (CSV, JSON, backups) goes through readAsText: refuse program files and oversize files there
(function(){
  try{
    var orig = FileReader.prototype.readAsText;
    FileReader.prototype.readAsText = function(blob){
      var c = secCheckTextFile(blob, SEC_TEXT_MAX);
      if(!c.ok){ try{ toast(c.msg); }catch(e){} var self = this; setTimeout(function(){ try{ self.onerror && self.onerror(new Error(c.msg)); }catch(e){} }, 0); return; }
      return orig.apply(this, arguments);
    };
  }catch(e){}
})();

/* ---- spreadsheet formula injection: a cell that starts with = + - @ is stored as text ---- */
function secCell(v){
  if(typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) && !/^[-+]?\d+([.,]\d+)?$/.test(v) ? "'" + v : v;
}

/* ---- sign in sessions: expiry and inactivity ---- */
var SESSION_MAX_AGE_MS = 7 * 86400000;
var _sessTouchAt = 0;
function sessionTouch(){
  var now = Date.now(); if(now - _sessTouchAt < 30000) return; _sessTouchAt = now;
  try{
    var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if(s && s.userId){ s.last = now; localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  }catch(e){}
}
function sessionFresh(saved){
  if(!saved || !saved.userId) return false;
  var now = Date.now(), at = saved.at || 0, last = saved.last || at;
  if(!at) return true;   // a session saved before expiry existed: accept it once, it is stamped right away
  if(now - at > SESSION_MAX_AGE_MS) return false;
  var mins = idleMinutes(), limit = (mins > 0 ? mins * 60000 : 12 * 3600000);
  return now - last <= Math.max(limit, 60000);
}

/* ---- a typed sync key must never be the all powerful service key ---- */
function secKeyProblem(key){
  try{
    var p = String(key || '').split('.');
    if(p.length === 3){
      var j = JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/')));
      if(j && /service/i.test(String(j.role || ''))) return tr('That is a private service key. Never paste it into Pesa. Use the anon public key instead.');
    }
  }catch(e){}
  if(/service_role/i.test(String(key || ''))) return tr('That is a private service key. Never paste it into Pesa. Use the anon public key instead.');
  return '';
}

Store.setGuard(dataGuard);
