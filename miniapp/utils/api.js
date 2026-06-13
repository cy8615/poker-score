const API = 'https://YOUR_DOMAIN_HERE/poker-api';

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API + path,
      method,
      data: body,
      header: { 'Content-Type': 'application/json' },
      success(r) {
        if (r.statusCode >= 200 && r.statusCode < 300) {
          resolve(r.data);
        } else {
          reject(new Error(r.data?.error || `HTTP ${r.statusCode}`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络错误'));
      }
    });
  });
}

function uploadAvatar(base64Data) {
  return request('/upload-avatar', 'POST', { image: base64Data });
}

module.exports = {
  get: (path) => request(path),
  post: (path, body) => request(path, 'POST', body),
  uploadAvatar,
};
