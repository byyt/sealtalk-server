var APIResult, Blacklist, Cache, Config, DataVersion, Friendship, Group, GroupMember, GroupSync, LoginLog, PayImgList,
    PayImgAndUserList,
    Session, User, Utility, VerificationCode, _, co, express,
    moment, qiniu, ref, rongCloud, router, sequelize, validator;

express = require('express');

co = require('co');

_ = require('underscore');

moment = require('moment');

rongCloud = require('rongcloud-sdk');

qiniu = require('qiniu');

Config = require('../conf');

Cache = require('../util/cache');

Session = require('../util/session');

Utility = require('../util/util').Utility;

APIResult = require('../util/util').APIResult;

ref = require('../db'), sequelize = ref[0], User = ref[1], Blacklist = ref[2], Friendship = ref[3], Group = ref[4],
    GroupMember = ref[5], GroupSync = ref[6], DataVersion = ref[7], VerificationCode = ref[8], LoginLog = ref[9],
    PayImgList = ref[10], PayImgAndUserList = ref[11];

router = express.Router();

validator = sequelize.Validator;

var DbUtil = require('./dbUtil');

var rongCloud = require('rongcloud-sdk')({
    appkey: Config.RONGCLOUD_APP_KEY,
    secret: Config.RONGCLOUD_APP_SECRET
});//融云sdk

var Message = rongCloud.Message;
var System = Message.System;


//测试例子
var message = {
    senderId: '约会秘书55',
    targetId: 'IILdhKyt',
    objectName: 'RCD:YhmsMsg',
    content: {
        content: "有新的消息79"
    }
};
System.send(message).then(sendResult => {
    console.log(sendResult);
}, error => {
    console.log(error);
});

var message2 = {
    senderId: '约会秘书嗷嗷',
    targetId: 'x1AZQRTs',
    objectName: 'RCD:YhmsMsg',
    content: {
        content: "有新的消息，还会"
    }
};
System.send(message2).then(sendResult => {
    console.log(sendResult);
}, error => {
    console.log(error);
});


