const api = require('../../utils/api');
const storage = require('../../utils/storage');
const { fmt, cls, esc, fmtTime, fmtDuration, groupTxs, randomName, COLORS } = require('../../utils/format');

Page({
  data: {
    room: {}, sorted: [], txGroups: [],
    myId: '', myName: '', isClosed: false, isCreator: false,
    duration: '--', settleDuration: '', settleTime: '', creatorName: '',
    showPay: false, payTarget: '', payTargetId: '', amount: '',
    showMenuModal: false, showChangeNameModal: false, changeNameValue: '', changeAvatarUrl: '', changeAvatarTmpPath: '',
    myAvatarUrl: '',
    // 聊天
    showChat: false, chatMsg: '', messages: [], unreadCount: 0,
    // 踢人
    showKickConfirm: false, kickTargetId: '', kickTargetName: ''
  },

  pollingTimer: null,
  durationTimer: null,
  chatTimer: null,
  startTime: 0,
  chatReadTimestamp: 0,

  onLoad() {
    const app = getApp();
    const { roomData, myId } = app.globalData;
    if (!roomData) { wx.navigateBack(); return; }
    const p = storage.loadProfile();
    this.setData({ myId, myAvatarUrl: p.avatarUrl || '' });
    this.startTime = roomData.createdAt;
    this.renderRoom(roomData);
    this.startDuration();
    this.startPolling();
    this.loadChatRead();
    this.startChatPolling();
  },

  onUnload() {
    this.stopPolling();
    this.stopDuration();
    this.stopChatPolling();
  },
  onHide() {
    this.stopPolling();
    this.stopChatPolling();
  },
  onShow() {
    this.startPolling();
    this.startChatPolling();
    this.updateUnread();
  },

  // 渲染
  renderRoom(room) {
    const isClosed = !!room.closed;
    const sorted = [...room.members].sort((a, b) => b.score - a.score).map(m => ({
      ...m,
      initial: (m.name || '?')[0],
      color: COLORS[m.colorIdx % COLORS.length],
      showScore: (m.score >= 0 ? '+' : '') + m.score
    }));
    const txs = [...(room.transactions || [])];
    const groups = groupTxs(txs).reverse().map(g => ({
      ...g,
      timeLabel: fmtTime(g.time),
      items: g.items.reverse().map(tx => ({
        ...tx,
        fromName: (room.members.find(m => m.id === tx.fromMemberId) || {}).name || '?',
        toName: (room.members.find(m => m.id === tx.toMemberId) || {}).name || '?',
        fromId: tx.fromMemberId, toId: tx.toMemberId
      }))
    }));

    const isCreator = this.data.myId === room.creatorId;
    const creator = room.members.find(m => m.id === room.creatorId);
    const creatorName = creator ? creator.name : '?';
    const me = room.members.find(m => m.id === this.data.myId);
    const myName = me ? me.name : '?';

    // 更新 startTime，确保计时器基于服务端 createdAt
    if (room.createdAt) this.startTime = room.createdAt;
    const durationText = isClosed
      ? '对局时长：' + fmtDuration(room.settleDuration)
      : '对局时长：' + fmtDuration(Date.now() - this.startTime);

    this.setData({
      room, sorted, txGroups: groups, isClosed, isCreator, creatorName, myName,
      durationText,
      settleTime: room.settledAt ? fmtTime(room.settledAt) : ''
    });

    // 更新全局
    getApp().globalData.roomData = room;
  },

  // 计时器
  startDuration() {
    if (this.data.isClosed) return;
    this.stopDuration();
    const update = () => {
      const ms = Date.now() - this.startTime;
      const dur = fmtDuration(ms);
      this.setData({ duration: dur, durationText: '对局时长：' + dur });
    };
    update();
    this.durationTimer = setInterval(update, 1000);
  },
  stopDuration() {
    if (this.durationTimer) { clearInterval(this.durationTimer); this.durationTimer = null; }
  },

  // 轮询
  startPolling() {
    if (this.data.isClosed) return;
    this.stopPolling();
    this.pollingTimer = setInterval(() => this.doRefresh(), 15000);
  },
  stopPolling() {
    if (this.pollingTimer) { clearInterval(this.pollingTimer); this.pollingTimer = null; }
  },

  async doRefresh() {
    try {
      const d = await api.get('/room?id=' + getApp().globalData.roomId);
      if (d.room) this.renderRoom(d.room);
    } catch {}
  },

  leaveRoom() {
    const app = getApp();
    app.globalData.roomId = null;
    app.globalData.myId = null;
    app.globalData.roomData = null;
    wx.navigateBack();
  },

  // 头像加载失败时回退到首字母
  onAvatarError(e) {
    const id = e.currentTarget.dataset.id;
    const sorted = this.data.sorted.map(m => m.id === id ? { ...m, avatarFail: true } : m);
    this.setData({ sorted });
  },
  // 转账
  tapMember(e) {
    if (this.data.isClosed) return;
    const id = e.currentTarget.dataset.id;
    if (id === this.data.myId) return;
    const m = this.data.sorted.find(x => x.id === id);
    this.setData({ showPay: true, payTarget: m.name, payTargetId: id, amount: '' });
  },
  setAmount(e) { this.setData({ amount: e.currentTarget.dataset.amt }); },
  onAmount(e) { this.setData({ amount: e.detail.value }); },
  closePay() { this.setData({ showPay: false }); },
  noop() {},

  async doTransfer() {
    const app = getApp();
    const amt = parseInt(this.data.amount);
    if (!amt || amt <= 0) { wx.showToast({ title: '请输入有效金额', icon: 'none' }); return; }
    try {
      const d = await api.post('/transfer', {
        roomId: app.globalData.roomId,
        fromMemberId: app.globalData.myId,
        toMemberId: this.data.payTargetId,
        amount: amt,
        note: ''
      });
      this.setData({ showPay: false });
      this.renderRoom(d.room);
      wx.showToast({ title: '已转 ' + amt + ' 给 ' + this.data.payTarget, icon: 'success' });
    } catch (e) { wx.showToast({ title: '转账失败:' + e.message, icon: 'none' }); }
  },

  // 菜单
  showMenu() { this.setData({ showMenuModal: true }); },
  closeMenu() { this.setData({ showMenuModal: false }); },

  // 复制房号
  copyRoomId() {
    wx.setClipboardData({ data: this.data.room.id, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
  },

  // 复制分享链接
  copyRoomLink() {
    const link = 'http://YOUR_DOMAIN_HERE/poker.html?room=' + this.data.room.id;
    wx.setClipboardData({ data: link, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
  },

  // 修改昵称
  showChangeName() {
    const me = this.data.sorted.find(m => m.id === this.data.myId);
    this.setData({ showMenuModal: false, showChangeNameModal: true, changeNameValue: this.data.myName, changeAvatarUrl: me.avatarUrl || '', changeAvatarTmpPath: '' });
  },
  closeChangeName() { this.setData({ showChangeNameModal: false }); },
  randomChangeName() { this.setData({ changeNameValue: randomName() }); },
  onChangeNameInput(e) { this.setData({ changeNameValue: e.detail.value }); },
  onRoomChooseAvatar(e) {
    const tmpPath = e.detail.avatarUrl;
    this.setData({ changeAvatarTmpPath: tmpPath, changeAvatarUrl: tmpPath });
    // 上传头像到服务器
    wx.getFileSystemManager().readFile({
      filePath: tmpPath,
      encoding: 'base64',
      success: async (res) => {
        try {
          const uploadRes = await api.uploadAvatar(res.data);
          if (uploadRes.avatarUrl) {
            this.setData({ changeAvatarUrl: 'https://YOUR_DOMAIN_HERE' + uploadRes.avatarUrl, changeAvatarTmpPath: '' });
          }
        } catch (err) { console.warn('头像上传失败', err); }
      },
      fail: () => { console.warn('读取头像文件失败'); }
    });
  },
  async doChangeName() {
    const name = this.data.changeNameValue.trim();
    if (!name) { wx.showToast({ title: '请输入昵称', icon: 'none' }); return; }
    try {
      const app = getApp();
      const d = await api.post('/rename', { roomId: app.globalData.roomId, memberId: app.globalData.myId, name, avatarUrl: this.data.changeAvatarUrl });
      this.setData({ showChangeNameModal: false });
      this.renderRoom(d.room);
      wx.showToast({ title: '昵称已更新', icon: 'success' });
    } catch (e) { wx.showToast({ title: '修改失败:' + e.message, icon: 'none' }); }
  },

  // 重置积分
  async doReset() {
    this.setData({ showMenuModal: false });
    const res = await new Promise(r => wx.showModal({
      title: '确认重置积分？',
      content: '所有成员的积分将归零，转账记录清空',
      success: r
    }));
    if (!res.confirm) return;
    try {
      const app = getApp();
      const d = await api.post('/reset', { roomId: app.globalData.roomId });
      this.renderRoom(d.room);
      wx.showToast({ title: '已重置', icon: 'success' });
    } catch (e) { wx.showToast({ title: '重置失败:' + e.message, icon: 'none' }); }
  },

  async doSettle() {
    this.setData({ showMenuModal: false });
    const res = await new Promise(r => wx.showModal({
      title: '确定结算并关闭房间？',
      content: '结算后房间变为只读，不再支持转账等操作。',
      success: r
    }));
    if (!res.confirm) return;
    try {
      const app = getApp();
      await api.post('/settle', { roomId: app.globalData.roomId, memberId: app.globalData.myId });
      wx.showToast({ title: '已结算', icon: 'success' });
      await this.doRefresh();
    } catch (e) { wx.showToast({ title: '结算失败:' + e.message, icon: 'none' }); }
  },

  async doDelete() {
    this.setData({ showMenuModal: false });
    const res = await new Promise(r => wx.showModal({
      title: '确定删除房间？', content: '本地记录和服务器数据都将删除',
      success: r
    }));
    if (!res.confirm) return;
    try {
      const app = getApp();
      await api.post('/delete', { roomId: app.globalData.roomId, memberId: app.globalData.myId });
      this.stopPolling(); this.stopDuration();
      app.globalData = { roomId: null, myId: null, roomData: null };
      wx.navigateBack();
    } catch (e) { wx.showToast({ title: '删除失败:' + e.message, icon: 'none' }); }
  },

  // ============ 踢人 ============
  onKickTap(e) {
    if (this.data.isClosed) return;
    const id = e.currentTarget.dataset.id;
    const m = this.data.sorted.find(x => x.id === id);
    if (!m || m.score !== 0) return;
    this.setData({ showKickConfirm: true, kickTargetId: id, kickTargetName: m.name });
  },
  closeKickConfirm() { this.setData({ showKickConfirm: false }); },
  async doKick() {
    const app = getApp();
    const { kickTargetId, kickTargetName } = this.data;
    try {
      await api.post('/kick', { roomId: app.globalData.roomId, memberId: kickTargetId });
      this.setData({ showKickConfirm: false });
      await this.doRefresh();
      wx.showToast({ title: '已踢出 ' + kickTargetName, icon: 'success' });
    } catch (e) { wx.showToast({ title: '踢出失败:' + e.message, icon: 'none' }); }
  },

  // ============ 聊天 ============
  loadChatRead() {
    try {
      const key = 'chatRead_' + getApp().globalData.roomId;
      this.chatReadTimestamp = parseInt(wx.getStorageSync(key) || '0');
    } catch { this.chatReadTimestamp = 0; }
  },
  saveChatRead(ts) {
    this.chatReadTimestamp = ts;
    const key = 'chatRead_' + getApp().globalData.roomId;
    wx.setStorageSync(key, String(ts));
  },
  updateUnread() {
    const msgs = this.data.messages;
    const unread = msgs.filter(m => m.memberId !== this.data.myId && m.timestamp > this.chatReadTimestamp).length;
    this.setData({ unreadCount: unread });
  },

  startChatPolling() {
    this.stopChatPolling();
    this.doChatRefresh();
    this.chatTimer = setInterval(() => this.doChatRefresh(), 5000);
  },
  stopChatPolling() {
    if (this.chatTimer) { clearInterval(this.chatTimer); this.chatTimer = null; }
  },

  async doChatRefresh() {
    try {
      const app = getApp();
      const d = await api.get('/room?id=' + app.globalData.roomId);
      if (d.room && d.room.recentMessages) {
        const members = d.room.members || [];
        let lastTs = 0;
        const msgs = d.room.recentMessages.map((m, i) => {
          const sender = members.find(x => x.id === m.memberId);
          const ts = m.time;
          const showTime = i === 0 || (ts - lastTs > 120000);
          lastTs = ts;
          return {
            ...m,
            name: sender?.name || '?',
            initial: (sender?.name || '?')[0],
            color: COLORS[sender?.colorIdx !== undefined ? sender.colorIdx % COLORS.length : 0],
            avatarUrl: sender?.avatarUrl || (m.memberId === this.data.myId ? this.data.myAvatarUrl : ''),
            isMe: m.memberId === this.data.myId,
            showTime,
            timeLabel: showTime ? this.fmtChatTime(ts) : ''
          };
        });
        this.setData({ messages: msgs });
        if (!this.data.showChat) this.updateUnread();
      }
    } catch {}
  },

  toggleChat() {
    const show = !this.data.showChat;
    this.setData({ showChat: show });
    if (show) {
      this.saveChatRead(Date.now());
      this.setData({ unreadCount: 0 });
    }
  },
  onChatInput(e) { this.setData({ chatMsg: e.detail.value }); },
  async sendChat() {
    const text = this.data.chatMsg.trim();
    if (!text) return;
    try {
      const app = getApp();
      await api.post('/chat', { roomId: app.globalData.roomId, memberId: app.globalData.myId, text });
      this.setData({ chatMsg: '' });
      await this.doChatRefresh();
    } catch (e) { wx.showToast({ title: '发送失败:' + e.message, icon: 'none' }); }
  },

  fmtChatTime(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  onShareAppMessage() {
    const app = getApp();
    const roomId = app.globalData.roomId;
    const myName = this.data.myName || '';
    return {
      title: myName + ' 邀请你加入牌局「' + roomId + '」',
      path: '/pages/index/index?room=' + roomId
    };
  }
});
