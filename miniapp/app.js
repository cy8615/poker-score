App({
  onLaunch() {
    // 初始化全局数据
    this.globalData = {
      roomId: null,
      myId: null,
      roomData: null,
      pollingTimer: null,
      durationTimer: null
    };
  }
});
