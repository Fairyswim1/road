const $ = id => document.getElementById(id);
const API = '/api/ar-trial';
const CDN = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/';
let session, state, photoBlob, photoImage, photoURL, poll, ar, texture, geometry, material, targetURL;
let busy = false, detected = false, detectTimer, starting = false, cameraGeneration = 0;
function message(text) { $('message').textContent = text; $('message').hidden = !text; }
function tokenHeaders() { return { Authorization: `Bearer ${session.token}` }; }
async function request(action, body = {}) {
  const response = await fetch(`${API}?action=${action}`, { method: 'POST', headers: { ...tokenHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: session.id, ...body }) });
  const data = await response.json();
  if (!response.ok) { if (data.winner !== undefined) { state = data; render(); } throw new Error(data.error || '요청을 처리하지 못했습니다.'); }
  return data;
}
function link(token) { return `${location.origin}/ar-lab.html#id=${session.id}&token=${token}`; }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); message('링크를 복사했습니다. 메시지에 붙여 넣어 다른 아이폰에 전달하세요.'); }
  catch { window.prompt('아래 링크를 길게 눌러 복사하세요.', text); }
}
async function load() {
  const response = await fetch(`${API}?id=${session.id}`, { headers: tokenHeaders(), cache: 'no-store' });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || '테스트를 불러오지 못했습니다.');
  state = data; render();
}
function render() {
  const admin = state.role === 'admin';
  $('setup').hidden = true; $('room').hidden = false; $('teacher').hidden = !admin;
  $('room-title').textContent = state.label;
  $('role').textContent = admin ? '교사' : state.teams[0].name;
  $('inventory').textContent = state.winner ? `${state.winnerName} 보관함 · 카드 7 획득 완료` : '카드 7 · 아직 아무 모둠도 획득하지 않았어요.';
  $('scan').textContent = admin ? '카메라로 배치 미리 보기' : '카메라로 카드 찾기';
  $('team-links').replaceChildren();
  if (admin) for (const team of state.teams) {
    const row = document.createElement('div'), name = document.createElement('span'), button = document.createElement('button');
    name.textContent = team.name; button.textContent = '참여 링크 복사'; button.className = 'secondary'; button.onclick = () => copy(link(team.token));
    row.append(name, button); $('team-links').append(row);
  }
  if (material) material.opacity = state.winner ? 0.3 : 1;
  updateClaim();
}
function updateClaim() {
  if (!state) return;
  $('claim').disabled = busy || !detected || !!state.winner || state.role === 'admin';
  $('claim').textContent = state.winner ? `${state.winnerName} 획득 완료` : state.role === 'admin' ? '배치 미리 보기 · 획득은 모둠 링크에서' : detected ? '카드 7 획득하기' : '표지를 찾으면 획득할 수 있어요';
}
async function showPhoto() {
  const response = await fetch(`${API}?id=${session.id}&asset=photo`, { headers: tokenHeaders() });
  if (!response.ok) return;
  if (photoURL) URL.revokeObjectURL(photoURL);
  photoURL = URL.createObjectURL(await response.blob()); $('target-photo').src = photoURL; $('target-photo').hidden = false;
}
async function join() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.get('id') || !params.get('token')) return;
  session = { id: params.get('id'), token: params.get('token') };
  try { await load(); await showPhoto(); clearInterval(poll); poll = setInterval(() => load().catch(() => message('연결이 끊겼습니다. 인터넷을 확인하세요. 획득은 서버 확인 후 저장됩니다.')), 3000); }
  catch (e) { message(e.message); }
}
$('photo').onchange = async () => {
  $('create').disabled = true; photoBlob = null; photoImage = null; message('사진을 준비하고 있습니다.');
  const file = $('photo').files[0]; if (!file) { message(''); return; }
  if (file.size > 25_000_000) { message('25MB 이하 사진을 골라주세요.'); return; }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const ratio = Math.min(1, 720 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(img.naturalWidth * ratio); canvas.height = Math.round(img.naturalHeight * ratio);
    if (Math.min(canvas.width, canvas.height) < 160) throw new Error('너무 작거나 긴 사진입니다. 표지를 다시 찍어주세요.');
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    photoBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
    if (!photoBlob) throw new Error('사진을 처리하지 못했습니다. JPG 사진으로 다시 시도하세요.');
    if (photoURL) URL.revokeObjectURL(photoURL); photoURL = URL.createObjectURL(photoBlob);
    photoImage = new Image(); photoImage.src = photoURL; await photoImage.decode();
    $('preview').src = photoURL; $('preview-wrap').hidden = false; $('create').disabled = false; message('사진을 확인하고 카드 숨기기를 눌러주세요.');
  } catch(e) { message(e.message || '사진을 열지 못했습니다. JPG 또는 PNG로 다시 시도하세요.'); }
  finally { URL.revokeObjectURL(url); }
};
$('create-form').onsubmit = async event => {
  event.preventDefault(); if (busy || !photoImage) return; busy = true;
  $('create').disabled = true; $('photo').disabled = true; $('progress').hidden = false;
  message('사진의 특징을 분석합니다. 화면을 켜 둔 채 기다려주세요. 아이폰에서는 시간이 걸릴 수 있습니다.');
  try {
    const { Compiler } = await import(CDN + 'mindar-image.prod.js');
    const compiler = new Compiler();
    const data = await compiler.compileImageTargets([photoImage], progress => { $('progress').value = progress; });
    const points = data[0]?.matchingData?.reduce((n, level) => n + (level.maximaPoints?.length || 0) + (level.minimaPoints?.length || 0), 0);
    if (points !== undefined && points < 30) throw new Error('구별할 무늬가 부족합니다. 그림이나 글자가 다양한 다른 표지를 골라주세요.');
    const buffer = await compiler.exportData();
    const form = new FormData(); form.append('label', $('label').value.trim()); form.append('photo', photoBlob, 'target.jpg'); form.append('target', new Blob([buffer]), 'target.mind');
    message('인식 데이터를 저장합니다.');
    const response = await fetch(API + '?action=create', { method: 'POST', body: form }); const saved = await response.json();
    if (!response.ok) throw new Error(saved.error || '저장하지 못했습니다. 다시 시도하세요.');
    location.hash = new URLSearchParams({ id: saved.id, token: saved.adminToken }).toString();
    await join(); message('카드 7을 숨겼습니다. 교사용 링크를 보관하고, 다른 아이폰에는 모둠 참여 링크를 전달하세요.');
  } catch(e) { message(e.message || '사진 분석에 실패했습니다. Safari에서 다시 시도하세요.'); }
  finally { busy = false; $('create').disabled = false; $('photo').disabled = false; $('progress').hidden = true; }
};
function makeCard(THREE) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 640;
  const c = canvas.getContext('2d'); c.fillStyle = '#f4f7e9'; c.fillRect(0, 0, 512, 640);
  c.strokeStyle = '#17785c'; c.lineWidth = 18; c.strokeRect(10, 10, 492, 620);
  c.fillStyle = '#17533f'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('FORMULA ROAD', 256, 70);
  c.strokeStyle = '#bfdbb4'; c.lineWidth = 55; c.lineCap = 'round'; c.beginPath(); c.moveTo(256, 190); c.lineTo(256, 510); c.lineTo(485, 510); c.stroke();
  c.fillStyle = '#164b3a'; c.font = 'bold 210px sans-serif'; c.fillText('7', 256, 370);
  c.font = '24px sans-serif'; c.fillText('AR CARD  /  01', 256, 592);
  texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  geometry = new THREE.PlaneGeometry(.75, .9375);
  material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material); mesh.position.z = .04; return mesh;
}
function dispose(instance) {
  if (!instance) return;
  instance.renderer?.setAnimationLoop(null);
  try { instance.controller?.stopProcessVideo(); } catch { /* A start cancelled before controller initialization. */ }
  instance.video?.srcObject?.getTracks().forEach(track => track.stop());
  instance.video?.remove(); instance.renderer?.dispose();
}
function closeCamera() {
  cameraGeneration++; clearTimeout(detectTimer); detected = false; starting = false;
  dispose(ar); ar = null; texture?.dispose(); geometry?.dispose(); material?.dispose(); texture = geometry = material = null;
  if (targetURL) URL.revokeObjectURL(targetURL); targetURL = null;
  $('ar-container').replaceChildren(); $('camera').hidden = true; document.body.classList.remove('scanning'); updateClaim();
}
$('scan').onclick = async () => {
  if (starting || ar) return; starting = true; const generation = ++cameraGeneration;
  $('camera').hidden = false; document.body.classList.add('scanning'); $('camera-state').textContent = 'AR 카메라를 준비하고 있습니다.'; $('camera-help').textContent = '카메라 접근을 허용한 뒤 표지 전체를 비춰주세요.';
  let current;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('HTTPS 주소를 아이폰 Safari에서 열어주세요.');
    const [{ MindARThree }, THREE, response] = await Promise.all([import(CDN + 'mindar-image-three.prod.js'), import('three'), fetch(`${API}?id=${session.id}&asset=target`, { headers: tokenHeaders() })]);
    if (!response.ok) throw new Error('인식 데이터를 불러오지 못했습니다.');
    const blob = await response.blob(); if (generation !== cameraGeneration) return;
    targetURL = URL.createObjectURL(blob);
    current = new MindARThree({ container: $('ar-container'), imageTargetSrc: targetURL, maxTrack: 1, uiLoading: 'no', uiScanning: 'no', uiError: 'no', warmupTolerance: 5, missTolerance: 5 });
    ar = current; current.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const anchor = current.addAnchor(0); anchor.group.add(makeCard(THREE));
    anchor.onTargetFound = () => { clearTimeout(detectTimer); detectTimer = setTimeout(() => { if (ar !== current) return; detected = true; $('camera-state').textContent = '표지 인식 성공'; $('camera-help').textContent = '카드가 물건 위에 나타났어요. 아래 버튼으로 획득하세요.'; updateClaim(); }, 700); };
    anchor.onTargetLost = () => { clearTimeout(detectTimer); detected = false; $('camera-state').textContent = '표지를 다시 비춰주세요'; $('camera-help').textContent = '표지 전체가 보이도록 천천히 움직여주세요.'; updateClaim(); };
    let timeoutId;
    const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('카메라 준비 시간이 길어졌습니다. 권한을 확인하고 다시 시도하세요.')), 60000); });
    const started = current.start().then(() => { if (generation !== cameraGeneration) dispose(current); });
    try { await Promise.race([started, timeout]); } finally { clearTimeout(timeoutId); }
    if (generation !== cameraGeneration) { dispose(current); return; }
    $('camera-state').textContent = '등록한 표지를 찾고 있습니다'; updateClaim();
    current.renderer.setAnimationLoop(() => current.renderer.render(current.scene, current.camera));
  } catch(e) { if (generation === cameraGeneration) { closeCamera(); message(e?.message || '카메라를 시작하지 못했습니다. Safari 카메라 권한을 허용하고 다시 시도하세요.'); } }
  finally { starting = false; }
};
$('claim').onclick = async () => {
  if (busy || !detected || state.role !== 'team' || state.winner) return;
  busy = true; updateClaim();
  try { state = await request('claim'); render(); closeCamera(); message('카드 7 획득! 모둠 보관함과 교사 화면에 저장했습니다.'); }
  catch(e) { $('camera-help').textContent = e.message; message(e.message); }
  finally { busy = false; updateClaim(); }
};
$('reset').onclick = async () => {
  if (!confirm('이번 카드의 획득 기록을 지우고 다시 숨길까요?')) return;
  try { state = await request('reset'); render(); message('카드를 다시 숨겼습니다. 모둠 링크에서 다시 찾아보세요.'); } catch(e) { message(e.message); }
};
$('copy-admin').onclick = () => copy(link(session.token));
$('close').onclick = closeCamera;
document.addEventListener('visibilitychange', () => { if (document.hidden && (ar || starting)) closeCamera(); });
window.addEventListener('pagehide', () => { clearInterval(poll); closeCamera(); });
await join();
