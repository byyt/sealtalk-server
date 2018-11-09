var APIResult, Blacklist, Cache, Config, DataVersion, Friendship, Group, GroupMember, GroupSync, LoginLog, PayImgList,
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
    PayImgList = ref[10];

router = express.Router();

validator = sequelize.Validator;

/**
 * 免费图片函数定义
 */
//向用户表中的某个用户插入一张免费图片 （对应用户上传免费图片操作）
//数据库操作与外边代码执行时异步的，所以传入一个回调，方便数据库操作完后，做后续的事
var insertFreeImgUrlById = function (id, imgUrl, callBack, callBackParam) {
    sequelize.transaction(function (t) {
        return User.findById(id, {
            attributes: ['freeImgList']
        }).then(function (user) {
            var results = Utility.encodeResults(user); //将数据库数据转成json，是个json数组
            var jsonArrayStr = results.freeImgList; //取出freeImgList字段中值，是个json数组的字符串
            var jsonArray = JSON.parse(jsonArrayStr); //将字符串转成json数组
            var json = {}; //定义一个json对象
            json.imgUrl = imgUrl; //给json对象的imgUrl字段存入http://192.168.1.236:8081/0003.jpg
            jsonArray.push(json); //将该json加入到jsonArray的json数组里
            var resultStr = JSON.stringify(jsonArray); //将json数组转成字符串
            return User.update({ //将结果更新到
                freeImgList: resultStr,
            }, {
                where: {
                    id: id
                }
            }).then(function () {
                //回调函数，在数据库执行完后做后续操作
                callBack = callBack || function () {
                };// 如果没有传入callBack，默认给一个空函数
                callBack(callBackParam); //  调用传进来的callBack
            });
        });
    });
};

//从用户表中的某个用户删除一张免费图片 （对应用户删除免费图片操作）
var deleteFreeImgUrlById = function (id, imgUrl, callBack) {
    sequelize.transaction(function (t) {
        return User.findById(id, {
            attributes: ['freeImgList']
        }).then(function (user) {
            var results = Utility.encodeResults(user); //将数据库数据转成json，是个json数组
            var jsonArrayStr = results.freeImgList; //取出freeImgList字段中值，是个json数组的字符串
            var jsonArray = JSON.parse(jsonArrayStr); //将字符串转成json数组
            for (var i = 0; i < jsonArray.length; i++) { //查找imgUrl值是给定值的json
                if (jsonArray[i].imgUrl === imgUrl) {
                    jsonArray.splice(i, 1); //删掉这个对象
                    break;
                }
            }
            var resultStr = JSON.stringify(jsonArray); //将json数组转成字符串
            return User.update({ //将结果更新到
                freeImgList: resultStr,
            }, {
                where: {
                    id: id
                }
            }).then(function () {
                //回调函数，在数据库执行完后做后续操作
                callBack = callBack || function () {
                };// 如果没有传入callBack，默认给一个空函数
                callBack(); //  调用传进来的callBack
            });
        });
    });
};

//清空某个用户的免费图片表，实际上就是把字段值设置为[]
var clearFreeImgUrlById = function (id, callBack) {
    sequelize.transaction(function (t) {
        return User.update({ //将结果更新到
            freeImgList: '[]',
        }, {
            where: {
                id: id
            }
        }).then(function () {
            callBack = callBack || function () {
            };
            callBack();
        });
    });
};

//对单个用户批量插入图片，插入的图片序号从fromIndex到toIndex
var batchInsertFreeImgUrlById = function (userId, fromIndex, toIndex) {
    //直接循环调用插入操作不行，因为数据操作和这些代码操作是异步的，应该先插入完一条，回调函数再插入下一条
    // for (var i = fromIndex; i < toIndex; i++) {
    //     insertFreeImgUrlById(1, 'http://192.168.1.236:8081/000' + i + '.jpg');
    // }
    //这个是插入一条数据库后的回调，继续插入一条数据
    var callBack = function (fromIndex) {
        if (fromIndex <= toIndex) {
            insertFreeImgUrlById(userId, 'http://192.168.1.236:8081/' + fromIndex + '.jpg', callBack, ++fromIndex);
        }
    };
    callBack(fromIndex);
};

/**
 * 付费图片函数定义
 */

//插入单条数据，插入数据到付费图标表中
var insertPayImgUrlById = function (userId, imgUrl) {
    sequelize.transaction(function (t) {
        return PayImgList.create({
            ownerId: userId,
            imgUrl: imgUrl
        }, {
            transaction: t
        }).then(function (payImgList) {

        });
    });
};

//批量插入数据到付费图片表中
var batchInsertPayImgUrlById = function (userId, fromIndex, toIndex) {
    //可以直接通过for循环执行插入操作，与批量更新user表的免费图片数据不同，那个需要在回调中一张一张插入
    for (var i = fromIndex; i <= toIndex; i++) {
        insertPayImgUrlById(userId, 'http://192.168.1.236:8081/' + i + '.jpg');
    }
};

//删除付费表中userId的数据
var clearPayImgUrlById = function (userId) {
    sequelize.transaction(function (t) {
        return PayImgList.destroy({
            where: {
                ownerId: userId
            }
        }).then(function (result) {

        });

    });
};
/**
 * 下面是执行指令的，不用的，请注释掉
 */

//单条数据插入免费图片表
// insertFreeImgUrlById(1, 'http://192.168.1.236:8081/1.jpg');

//单条数据删除免费图片
// deleteFreeImgUrlById(1, 'http://192.168.1.236:8081/3.jpg');

//批量插入免费图片表
// batchInsertFreeImgUrlById(4, 1, 8);

//清空免费图片列表
// clearFreeImgUrlById(3);

//单条数据插入付费图片表
// insertPayImgUrlById(4, 'http://192.168.1.236:8081/3.jpg');

//批量插入付费图片表
// batchInsertPayImgUrlById(4, 10, 14);

//清空付费图片列表
clearPayImgUrlById(1);