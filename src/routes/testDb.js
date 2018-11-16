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

/**
 * 下面是执行指令的，不用的，请注释掉
 */

//单条数据插入免费图片表
// DbUtil.insertFreeImgUrlById(1, 'http://192.168.1.236:8081/1.jpg');

//单条数据删除免费图片
// DbUtil.deleteFreeImgUrlById(1, 'http://192.168.1.236:8081/3.jpg');

//批量插入免费图片表
// DbUtil.batchInsertFreeImgUrlById(4, 1, 8);

//清空免费图片列表
// DbUtil.clearFreeImgUrlById(3);

//单条数据插入付费图片表
// DbUtil.insertPayImgUrlById(4, 'http://192.168.1.236:8081/3.jpg');

//批量插入付费图片表
// DbUtil.batchInsertPayImgUrlById(4, 10, 14);

//清空付费图片列表
// DbUtil.clearPayImgUrlById(1);

//删除单张付费图片
// DbUtil.clearPayImgUrlByImgUrl('http://192.168.1.236:8081/1.jpg');

//单条数据插入xx用户对xx图片付费
// DbUtil.insertPayImgAndUserList(2, 19);

//根据userId删除数据xx用户对xx图片付费
// DbUtil.clearPayImgAndUserByUserId(2);

//根据imgId删除数据xx用户对xx图片付费
// DbUtil.clearPayImgAndUserByImgId(17);

//同时根据userId和imgId删除数据xx用户对xx图片付费
// DbUtil.clearPayImgAndUserByUserIdAndImgId(2, 30);

//更新用户的微信号和微信号价格
// DbUtil.updateUserWeChatAndWeChatPrice(2, 'yyttlll2222', 88);

//删除数据xx用户的付费微信
DbUtil.clearPayWeChatAndUserListById(2);

