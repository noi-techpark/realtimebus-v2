'use strict';

module.exports.getDevice = function(request) {
    return request.get("X-Device") || '?';
};

module.exports.getDeviceId = function(request) {
    return request.get("X-Device-Id") || request.get("X-Android-Id") || '?';
};

module.exports.getLanguage = function(request) {
    return request.get("X-Language") || '?';
};

module.exports.getSerial = function(request) {
    return request.get("X-Serial") || '?';
};

module.exports.getVersionCode = function(request) {
    return parseInt(request.get("X-Version-Code") || 0);
};

module.exports.getVersionName = function(request) {
    return request.get("X-Version-Name") ||'?';
};

module.exports.getVersionName = function(request) {
    return request.get("User-Agent") ||'?';
};

module.exports.getAccept = function(request) {
    return request.get("Accept") ||'?';
};

module.exports.getContentType = function(request) {
    return request.get("Content-Type") ||'?';
};

module.exports.getIp = function(request) {
    return request.get("X-IP") ||'?';
};