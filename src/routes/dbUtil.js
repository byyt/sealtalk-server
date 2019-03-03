var APIResult, Blacklist, Cache, Config, DataVersion, Friendship, Group, GroupMember, GroupSync, LoginLog, PayImgList,
    PayImgAndUserList, PayWeChatAndUserList,
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
    PayImgList = ref[10], PayImgAndUserList = ref[11], PayWeChatAndUserList = ref[12];

router = express.Router();

validator = sequelize.Validator;


DbUtil = (function () {
    function DbUtil() {
    }

    DbUtil.local_host = "http://192.168.0.101:8081/";

    /**
     * 免费图片函数定义
     */
    //向用户表中的某个用户插入一张免费图片，对应操作：用户上传一张免费图片
    //数据库操作与外边代码执行时异步的，所以传入一个回调，方便数据库操作完后，做后续的事
    DbUtil.insertFreeImgUrlById = function (id, imgUrl, callBack, callBackParam) {
        sequelize.transaction(function (t) {
            return User.findById(id, {
                attributes: ['freeImgList']
            }).then(function (user) {
                var results = Utility.encodeResults(user); //将数据库数据转成json，是个json数组
                var jsonArrayStr = results.freeImgList; //取出freeImgList字段中值，是个json数组的字符串
                if (results.freeImgList == "" || results.freeImgList == null || results.freeImgList == undefined) {
                    jsonArrayStr = "[]"
                }
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
    DbUtil.deleteFreeImgUrlById = function (id, imgUrl, callBack) {
        sequelize.transaction(function (t) {
            return User.findById(id, {
                attributes: ['freeImgList']
            }).then(function (user) {
                var results = Utility.encodeResults(user); //将数据库数据转成json，是个json数组
                var jsonArrayStr = results.freeImgList; //取出freeImgList字段中值，是个json数组的字符串
                var jsonArray = JSON.parse(jsonArrayStr); //将字符串转成json数组
                for (var i = 0; i < jsonArray.length; i++) { //查找imgUrl值是给定值的json
                    if (jsonArray[i].imgUrl === DbUtil.local_host + imgUrl) {
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
    DbUtil.clearFreeImgUrlById = function (id, callBack) {
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
    DbUtil.batchInsertFreeImgUrlById = function (userId, fromIndex, toIndex) {
        //直接循环调用插入操作不行，因为数据操作和这些代码操作是异步的，应该先插入完一条，回调函数再插入下一条
        // for (var i = fromIndex; i < toIndex; i++) {
        //     insertFreeImgUrlById(1, 'http://192.168.1.236:8081/000' + i + '.jpg');
        // }
        //这个是插入一条数据库后的回调，继续插入一条数据
        var callBack = function (fromIndex) {
            if (fromIndex <= toIndex) {
                DbUtil.insertFreeImgUrlById(userId, DbUtil.local_host + "renwu" + fromIndex + '.jpg', callBack, ++fromIndex);
            }
        };
        callBack(fromIndex);
    };

    /**
     * 付费图片函数定义
     */

    //插入单条数据，插入数据到付费图标表中，对应操作：用户上传一张付费图片
    DbUtil.insertPayImgUrlById = function (userId, imgUrl) {
        sequelize.transaction(function (t) {
            return PayImgList.create({
                ownerId: userId,
                imgUrl: DbUtil.local_host + imgUrl
            }, {
                transaction: t
            }).then(function (payImgList) {

            });
        });
    };

    //批量插入数据到付费图片表中
    DbUtil.batchInsertPayImgUrlById = function (userId, fromIndex, toIndex) {
        //可以直接通过for循环执行插入操作，与批量更新user表的免费图片数据不同，那个需要在回调中一张一张插入
        for (var i = fromIndex; i <= toIndex; i++) {
            insertPayImgUrlById(userId, 'http://192.168.1.236:8081/' + i + '.jpg');
        }
    };

    //删除付费图片表中userId的数据
    //因为关系表中有外键，所以做这个表的删除操作前，需要先删除关系表中的数据
    DbUtil.clearPayImgUrlById = function (userId) {
        sequelize.transaction(function (t) {
            return PayImgList.destroy({
                where: {
                    ownerId: userId
                }
            }).then(function (result) {

            });

        });
    };

    //删除付费图片表中imgUrl的图片
    //因为关系表中有外键，所以做这个表的删除操作前，需要先删除关系表中的数据
    DbUtil.clearPayImgUrlByImgUrl = function (imgUrl) {
        sequelize.transaction(function (t) {
            return PayImgList.destroy({
                where: {
                    imgUrl: imgUrl
                }
            }).then(function (result) {

            });

        });
    };

    /**
     * 付费图片与用户的关系表函数定义，即存的是xx用户已经付费xx图片
     */
    //插入单条数据，对应操作：xx用户对xx图片付费
    DbUtil.insertPayImgAndUserList = function (userId, imgId) {
        sequelize.transaction(function (t) {
            return PayImgAndUserList.create({
                userId: userId,
                imgId: imgId
            }, {
                transaction: t
            }).then(function (payImgAndUserList) {

            });
        });
    };

    //删除userId的所有数据，含义：xx用户的所有已付费图片都变成未付费
    //因为这个是关系表，有外键约束，如果要删除用户或者删除付费图片，需要先删除关系表里的数据，否则删除失败
    DbUtil.clearPayImgAndUserByUserId = function (userId) {
        sequelize.transaction(function (t) {
            return PayImgAndUserList.destroy({
                where: {
                    userId: userId
                }
            }).then(function (result) {

            });
        });
    };

    //删除imgId的所有数据，含义：xx付费图片对所有用户都变成未付费
    DbUtil.clearPayImgAndUserByImgId = function (imgId) {
        sequelize.transaction(function (t) {
            return PayImgAndUserList.destroy({
                where: {
                    imgId: imgId
                }
            }).then(function (result) {

            });
        });
    };

    //同时根据userId和imgId删除对应数据，含义：xx付费图片对xx图片变成未付费
    DbUtil.clearPayImgAndUserByUserIdAndImgId = function (userId, imgId) {
        sequelize.transaction(function (t) {
            return PayImgAndUserList.destroy({
                where: {
                    userId: userId,
                    imgId: imgId
                }
            }).then(function (result) {

            });
        });
    };

    /**
     * 微信号与用户的关系表函数定义，即存的是xx用户已经付费xx微信号
     */
    //对应操作：更新用户的微信号和微信号价格
    DbUtil.updateUserWeChatAndWeChatPrice = function (userId, weChat, weChatPrice) {
        return User.update({ //将结果更新到
            weChat: weChat,
            weChatPrice: weChatPrice
        }, {
            where: {
                id: userId
            }
        }).then(function () {

        });
    };

    //插入单条数据，对应操作：xx用户对xx微信付费
    DbUtil.insertPayWeChatAndUserList = function (userId, weChat, weChatPrice) {
        sequelize.transaction(function (t) {
            return PayWeChatAndUserList.create({
                userId: userId,
                weChat: weChat,
                weChatPrice: weChatPrice
            }, {
                transaction: t
            }).then(function (payImgAndUserList) {
                //在这里做的操作，不能确保数据已经插入了数据库
            });
        }).then(function () {
            //在这里做的操作，才能确保数据已经插入了数据库
        });
    };

    //删除数据，对应操作：将某个用户所用付费数据删除，变成都未付费。
    // 测试用，真是场景中不会有删除操作，即一旦付费，永远生效
    DbUtil.clearPayWeChatAndUserListById = function (userId) {
        sequelize.transaction(function (t) {
            return PayWeChatAndUserList.destroy({
                where: {
                    userId: userId
                }
            }).then(function (result) {

            });
        });
    };

    return DbUtil;
})();

module.exports = DbUtil;

/**
 * 要单独执行指令，请到testDb.js中
 */