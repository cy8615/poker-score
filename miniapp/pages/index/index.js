const api = require('../../utils/api');
const storage = require('../../utils/storage');
const { fmt, cls, esc, fmtTime, fmtDuration, groupTxs, randomName, COLORS } = require('../../utils/format');

Page({
  data: {
    recentRooms: [],
    roomCount: 0,
    identityCount: 0,
    showCreateModal: false, createName: '',
    showJoinModal: false, joinName: '', joinRoomId: '',
    showRoomIdModal: false, roomIdInput: '',
    profile: {}, showAuthModal: false, authAvatarUrl: ''
  },

  onLoad(options) {
    if (options.room) {
      this.setData({ showRoomIdModal: true, roomIdInput: options.room });
    }
  },

  onShow() {
    this.refreshHome();
    this.loadWechatProfile();
  },

  loadWechatProfile() {
    const cached = storage.loadProfile();
    if (cached.nickName) {
      this.setData({ profile: { avatarUrl: cached.avatarUrl, nickName: cached.nickName, hasProfile: true } });
      return;
    }
    this.setData({ profile: { hasProfile: false } });
  },

  showAuth() {
    this.setData({ showAuthModal: true });
  },

  onChooseAvatar(e) {
    const tmpPath = e.detail.avatarUrl;
    this.setData({ authAvatarUrl: tmpPath });
    // 上传头像到服务器
    wx.getFileSystemManager().readFile({
      filePath: tmpPath,
      encoding: 'base64',
      success: async (res) => {
        try {
          const uploadRes = await api.uploadAvatar(res.data);
          if (uploadRes.avatarUrl) {
            const p = storage.loadProfile();
            p.avatarUrl = 'https://YOUR_DOMAIN_HERE' + uploadRes.avatarUrl;
            p.nickName = p.nickName || '';
            storage.saveProfile(p);
          }
        } catch (err) {
          console.warn('头像上传失败', err);
          const p = storage.loadProfile();
          p.avatarUrl = tmpPath;
          p.nickName = p.nickName || '';
          storage.saveProfile(p);
        }
      },
      fail: () => {
        const p = storage.loadProfile();
        p.avatarUrl = tmpPath;
        p.nickName = p.nickName || '';
        storage.saveProfile(p);
      }
    });
  },
  onNicknameBlur(e) {
    const nickName = e.detail.value.trim();
    if (!nickName) return;
    const p = storage.loadProfile();
    p.nickName = nickName;
    p.avatarUrl = p.avatarUrl || '';
    storage.saveProfile(p);
  },
  finishAuth() {
    const p = storage.loadProfile();
    if (p.nickName) {
      p.hasProfile = true;
      storage.saveProfile(p);
      this.setData({ profile: p, showAuthModal: false });
    }
  },
  onAvatarError() {
    this.setData({ 'profile.avatarFail': true });
  },
  closeAuthModal() {
    const p = storage.loadProfile();
    storage.saveProfile({});
    this.setData({ profile: {}, showAuthModal: false });
  },

  refreshHome() {
    const m = storage.load();
    console.log('refreshHome m=', JSON.stringify(m));
    const roomIds = m.rooms || [];
    const recent = roomIds.slice(0, 6).map(id => ({
      id, icon: '🃏', name: id, meta: '--'
    }));
    this.setData({
      recentRooms: recent,
      roomCount: roomIds.length,
      identityCount: Object.keys(m.identities || {}).length
    });
    // 异步加载元数据
    recent.forEach((r, i) => this.loadRoomMeta(r.id, i));
  },

  async loadRoomMeta(id, idx) {
    try {
      const d = await api.get('/room?id=' + id);
      if (!d.room) {
        this.removeRecentRoom(id, idx);
        return;
      }
      const m = storage.load();
      const savedMid = (m.identities || {})[id];
      let score = '';
      if (savedMid) {
        const me = d.room.members.find(x => x.id === savedMid);
        if (me) score = fmt(me.score);
      }
      const count = d.room.members.length;
      this.setData({
        [`recentRooms[${idx}].meta`]: count + '人' + (score ? ' · ' + score : ''),
        [`recentRooms[${idx}].icon`]: d.room.icon || '🃏'
      });
    } catch (e) {
      console.warn('加载房间元数据失败 id=' + id, e);
    }
  },

  removeRecentRoom(id, idx) {
    const m = storage.load();
    m.rooms = m.rooms.filter(r => r !== id);
    storage.save(m);
    const rooms = this.data.recentRooms.filter(r => r.id !== id);
    this.setData({ recentRooms: rooms, roomCount: m.rooms.length });
  },

  // 进入房间
  async enterRoom(e) {
    const id = e.currentTarget.dataset.id;
    const m = storage.load();
    const savedMid = (m.identities || {})[id];
    if (savedMid) {
      try {
        const d = await api.get('/room?id=' + id);
        if (d.room && d.room.closed) {
          this.showClosedRoom(d.room); return;
        }
        if (d.room && d.room.members.find(x => x.id === savedMid)) {
          this.navToRoom(id, savedMid, d.room); return;
        }
      } catch {}
    }
    // 新加入
    const p = storage.loadProfile();
    const defName = p.nickName || m.defName || randomName();
    this.setData({ showJoinModal: true, joinRoomId: id, joinName: defName });
  },

  navToRoom(id, myId, room) {
    const app = getApp();
    app.globalData.roomId = id;
    app.globalData.myId = myId;
    app.globalData.roomData = room;
    wx.navigateTo({ url: '/pages/room/room' });
  },

  // 创建
  showCreate() {
    const m = storage.load();
    const p = storage.loadProfile();
    const defName = p.nickName || m.defName || randomName();
    this.setData({ showCreateModal: true, createName: defName });
  },
  onCreateName(e) { this.setData({ createName: e.detail.value }); },
  randomCreateName() { this.setData({ createName: randomName() }); },
  async doCreate() {
    const name = this.data.createName.trim();
    if (!name) { wx.showToast({ title: '请输入名字', icon: 'none' }); return; }
    try {
      const p = storage.loadProfile();
      const d = await api.post('/create', { name, avatarUrl: p.avatarUrl || '' });
      storage.addRecent(d.roomId);
      const m = storage.load();
      m.defName = name;
      m.identities[d.roomId] = d.memberId;
      storage.save(m);
      this.setData({ showCreateModal: false });
      this.navToRoom(d.roomId, d.memberId, d.room);
    } catch (e) { wx.showToast({ title: '创建失败:' + e.message, icon: 'none' }); }
  },

  // 加入 - 输入房间号
  async showJoin() {
    let defRoom = '';
    try {
      const d = await api.get('/rooms');
      if (d.rooms && d.rooms.length > 0) defRoom = d.rooms[0].id;
    } catch {}
    this.setData({ showRoomIdModal: true, roomIdInput: defRoom });
  },
  onRoomIdInput(e) { this.setData({ roomIdInput: e.detail.value }); },
  async doJoin() {
    const id = this.data.roomIdInput.trim();
    if (!id) { wx.showToast({ title: '请输入房间号', icon: 'none' }); return; }
    try {
      const d = await api.get('/room?id=' + id);
      if (!d.room) { wx.showToast({ title: '房间不存在', icon: 'none' }); return; }
      if (d.room.closed) { this.showClosedRoom(d.room); return; }
      this.setData({ showRoomIdModal: false });
      await this.enterRoom({ currentTarget: { dataset: { id } } });
    } catch { wx.showToast({ title: '房间不存在', icon: 'none' }); }
  },

  // 加入 - 输入名字
  onJoinName(e) { this.setData({ joinName: e.detail.value }); },
  randomJoinName() { this.setData({ joinName: randomName() }); },
  async doJoinFinal() {
    const id = this.data.joinRoomId;
    const name = this.data.joinName.trim();
    if (!name) { wx.showToast({ title: '请输入名字', icon: 'none' }); return; }
    try {
      const p = storage.loadProfile();
      const d = await api.post('/join', { roomId: id, name, avatarUrl: p.avatarUrl || '' });
      storage.addRecent(id);
      const m = storage.load();
      m.defName = name;
      m.identities[id] = d.memberId;
      storage.save(m);
      this.setData({ showJoinModal: false });
      this.navToRoom(id, d.memberId, d.room);
    } catch (e) { wx.showToast({ title: '加入失败:' + e.message, icon: 'none' }); }
  },

  // 已关闭房间弹窗
  showClosedRoom(room) {
    const sorted = [...room.members].sort((a, b) => b.score - a.score);
    const rows = sorted.map((m, i) => {
      const initial = (m.name || '?')[0];
      const color = COLORS[m.colorIdx % COLORS.length];
      const showScore = (m.score >= 0 ? '+' : '') + m.score;
      return (i + 1) + '. ' + initial + ' ' + m.name + '  ' + showScore;
    }).join('\n');
    wx.showModal({
      title: '房间「' + room.id + '」已结算',
      content: '排名    名字    积分\n' + rows,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 关闭弹窗
  closeModals() {
    this.setData({ showCreateModal: false, showJoinModal: false, showRoomIdModal: false });
  },
  noop() {},

  // 清除缓存
  clearLocalData() {
    wx.showModal({
      title: '确定清除本地缓存？',
      content: '清除后最近房间列表、身份记录和微信资料将丢失',
      success: (res) => {
        if (res.confirm) {
          storage.clearAll();
          storage.saveProfile({});
          this.refreshHome();
          this.setData({ profile: { hasProfile: false } });
        }
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '牌局记账 - 多人筹码记账助手',
      path: '/pages/index/index'
    };
  }
});
