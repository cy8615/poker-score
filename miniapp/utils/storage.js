const MYKEY = 'poker_my_v5';
const PROFILE_KEY = 'poker_profile';

function load() {
  try {
    const raw = wx.getStorageSync(MYKEY) || '{"identities":{},"rooms":[]}';
    return JSON.parse(raw);
  } catch { return { identities: {}, rooms: [] }; }
}

function save(o) {
  console.log('storage.save', JSON.stringify(o));
  wx.setStorageSync(MYKEY, JSON.stringify(o));
}

function addRecent(id) {
  const m = load();
  m.rooms = m.rooms.filter(r => r !== id);
  m.rooms.unshift(id);
  if (m.rooms.length > 10) m.rooms.pop();
  save(m);
}

function clearAll() {
  wx.removeStorageSync(MYKEY);
}

function loadProfile() {
  try {
    return JSON.parse(wx.getStorageSync(PROFILE_KEY) || '{}');
  } catch { return {}; }
}

function saveProfile(p) {
  wx.setStorageSync(PROFILE_KEY, JSON.stringify(p));
}

module.exports = { load, save, addRecent, clearAll, loadProfile, saveProfile };
