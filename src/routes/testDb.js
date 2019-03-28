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

//根据userId更新用户资料
//userId, nickname, sex, height, age, feedback_rate, location, followNum, fansNum, qianMing
// DbUtil.updateUserInfoById(3, '小明同学3', 1, 175, 28, 98, 2, 50, 198, '签名啊啊啊啊啊三三三三三三');
// DbUtil.updateUserInfoById(4, '小明同学4', 0, 172, 26, 95, 4, 35, 138, '签名啊啊啊啊啊四四四四四四');
// DbUtil.updateUserInfoById(5, '小明同学5', 1, 173, 27, 96, 6, 15, 128, '签名啊啊啊啊啊呜呜呜呜呜呜');
// DbUtil.updateUserInfoById(6, '小明同学6', 1, 178, 28, 98, 4, 25, 188, '签名啊啊啊啊啊六六六六六六');
// DbUtil.updateUserInfoById(7, '小明同学7', 0, 165, 29, 94, 5, 35, 288, '哎哎哎哎哎啊哎哎哎');
// DbUtil.updateUserInfoById(8, '小明同学8', 1, 170, 30, 96, 2, 28, 98, '撒付费电视打发发生地方');
// DbUtil.updateUserInfoById(9, '小红同学9', 0, 172, 36, 97, 8, 55, 100, '山东发生的发生地方撒的发束腹带阿斯顿发');
// DbUtil.updateUserInfoById(10, '小蓝同学10', 0, 188, 22, 95, 5, 65, 130, '阿斯顿发生的发生的发生的发生的发发');
DbUtil.updateUserInfoById(11, '小绿同学11', 1, 180, 18, 99, 6, 20, 120, '三大发生的发生发束腹带当时的发生地方');

//单条数据插入免费图片表
// DbUtil.insertFreeImgUrlById(3, '20.jpg');
// DbUtil.insertFreeImgUrlById(4, '29.jpg');
// DbUtil.insertFreeImgUrlById(5, '35.jpg');
// DbUtil.insertFreeImgUrlById(6, '41.jpg');

//单条数据删除免费图片
// DbUtil.deleteFreeImgUrlById(5, 'renwu6.jpg');

//批量插入免费图片表
//其实不是进行多次插入单个图片，而是先把多个图片存为一个字符串数组，然后对用户进行性一次插入
// DbUtil.batchInsertFreeImgUrlById(3, 20, 28);
// DbUtil.batchInsertFreeImgUrlById(4, 29, 34);
// DbUtil.batchInsertFreeImgUrlById(5, 35, 40);
// DbUtil.batchInsertFreeImgUrlById(6, 41, 46);
// DbUtil.batchInsertFreeImgUrlById(7, 47, 52);
// DbUtil.batchInsertFreeImgUrlById(8, 53, 60);
// DbUtil.batchInsertFreeImgUrlById(9, 1, 6);
// DbUtil.batchInsertFreeImgUrlById(10, 7, 12);
// DbUtil.batchInsertFreeImgUrlById(11, 12, 16);

//清空免费图片列表,
//注意，下面是一个很重要的问题，同时打开下面的语句，并发执行update，会执行失败，以后必须改正这个问题
// DbUtil.clearFreeImgUrlById(3);
// DbUtil.clearFreeImgUrlById(4);
// DbUtil.clearFreeImgUrlById(5);
// DbUtil.clearFreeImgUrlById(6);
// DbUtil.clearFreeImgUrlById(7);
// DbUtil.clearFreeImgUrlById(8);
// DbUtil.clearFreeImgUrlById(9);
// DbUtil.clearFreeImgUrlById(10);
// DbUtil.clearFreeImgUrlById(11);
//上面这种写法是可以并发执行多条的，但不知道数据安不安全
//下面这种写法不能并发执行多条，用了sequelize.transaction(function (t) {，但数据是安全的？
// DbUtil.clearFreeImgUrlByIdTransaction(5);
// DbUtil.clearFreeImgUrlByIdTransaction(6);
// DbUtil.clearFreeImgUrlByIdTransaction(7);
// DbUtil.clearFreeImgUrlByIdTransaction(8);
// DbUtil.clearFreeImgUrlByIdTransaction(9);
// DbUtil.clearFreeImgUrlByIdTransaction(10);
// DbUtil.clearFreeImgUrlByIdTransaction(11);

//单条数据插入付费图片表
// DbUtil.insertPayImgUrlById(5, 'renwu3.jpg', 18);

//批量插入付费图片表
// DbUtil.batchInsertPayImgUrlById(4, 10, 14,20);

//清空付费图片列表
// DbUtil.clearPayImgUrlById(3);

//删除单张付费图片
// DbUtil.clearPayImgUrlByImgUrl('http://192.168.1.236:8081/1.jpg');

//单条数据插入xx用户对xx图片付费
// DbUtil.insertPayImgAndUserList(3, 1);

//根据userId删除数据xx用户对xx图片付费
// DbUtil.clearPayImgAndUserByUserId(3);

//根据imgId删除数据xx用户对xx图片付费
// DbUtil.clearPayImgAndUserByImgId(17);

//同时根据userId和imgId删除数据xx用户对xx图片付费
// DbUtil.clearPayImgAndUserByUserIdAndImgId(2, 30);

//更新用户的微信号和微信号价格
// DbUtil.updateUserWeChatAndWeChatPrice(4, 'yyttlqweqwe2', 88);

//删除数据xx用户的付费微信
// DbUtil.clearPayWeChatAndUserListById(3);

//更新用户的技能信息
// DbUtil.updateUserSkillsByUserId(3, "{\"吃饭\":\"298元／小时\",\"健身\":\"198元／小时\"}")
// DbUtil.updateUserSkillsByUserId(4, "{\"跑步\":\"298元／小时\"}")
// DbUtil.updateUserSkillsByUserId(5, "{\"跑步\":\"290元／小时\",\"健身\":\"298元／小时\",\"吃饭\":\"398元／小时\",\"看电影\":\"300元／小时\"}")
// DbUtil.updateUserSkillsByUserId(6, "{\"跑步\":\"200元／小时\",\"健身\":\"198元／小时\"}")
// DbUtil.updateUserSkillsByUserId(7, "{\"跑步\":\"390元／小时\",\"健身\":\"892元／小时\",\"吃饭\":\"398元／小时\",\"看电影\":\"500元／小时\"}")
// DbUtil.updateUserSkillsByUserId(8, "{\"跑步\":\"295元／小时\",\"健身\":\"298元／小时\",\"吃饭\":\"498元／小时\",\"看电影\":\"320元／小时\"}")

