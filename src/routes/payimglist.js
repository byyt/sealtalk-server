var APIResult, Blacklist, Cache, Config, DataVersion, Friendship, Group, GroupMember, GroupSync, LoginLog, PayImgList,
    MAX_GROUP_MEMBER_COUNT, NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH,
    PORTRAIT_URI_MAX_LENGTH, PORTRAIT_URI_MIN_LENGTH, Session, User, Utility, VerificationCode, _, co, express,
    getToken, moment, qiniu, ref, regionMap, rongCloud, router, sequelize, validator;

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
    PayImgList = ref[10];

MAX_GROUP_MEMBER_COUNT = 500;

NICKNAME_MIN_LENGTH = 1;

NICKNAME_MAX_LENGTH = 32;

PORTRAIT_URI_MIN_LENGTH = 12;

PORTRAIT_URI_MAX_LENGTH = 256;

PASSWORD_MIN_LENGTH = 6;

PASSWORD_MAX_LENGTH = 20;

rongCloud.init(Config.RONGCLOUD_APP_KEY, Config.RONGCLOUD_APP_SECRET);

router = express.Router();

validator = sequelize.Validator;

regionMap = {
    '86': 'zh-CN'
};

//详情页获取付费图片列表中哪些图片是该用户已经付费的，如果未付费，则客户端模糊展示
router.get('/get_imgpay_info', function (req, res, next) {
    console.log("get_imgpay_info");

    return res.send(new APIResult(200, Utility.encodeResults({
        token: 'fake token'
    })));
});


module.exports = router;
