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
     * 更新个人信息
     */
    //更新某个用户个人信息，对应操作：用户修改个人资料
    //注意，这个是新加的操作，没有带sequelize.transaction(，这样是可以并发执行的？
    //如果带了sequelize.transaction(，没法同时执行多条该语句，sequelize.transaction(是为了保证执行的先后顺序？
    //后边的所有语句我几乎都用了sequelize.transaction(
    DbUtil.updateUserInfoById =
        function (userId, nickname, sex, height, age, feedback_rate, location, followNum, fansNum, qianMing) {
            return User.update({ //将结果更新到
                nickname: nickname,
                sex: sex,
                height: height,
                age: age,
                feedback_rate: feedback_rate,
                location: location,
                followNum: followNum,
                fansNum: fansNum,
                qianMing: qianMing
            }, {
                where: {
                    id: userId
                }
            }).then(function () {

            });

        }

    /**
     * 免费图片函数定义
     */
    //向用户表中的某个用户插入一张免费图片，对应操作：用户上传一张免费图片
    //数据库操作与外边代码执行时异步的，所以传入一个回调，方便数据库操作完后，做后续的事
    //带了sequelize.transaction(function (t) {，等于按顺序执行？不支持高并发同时操作？
    DbUtil.insertFreeImgUrlByIdTransaction = function (id, imgUrl, callBack, callBackParam) {
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
                json.imgUrl = DbUtil.local_host + imgUrl; //给json对象的imgUrl字段存入http://192.168.0.101:8081/0003.jpg
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

    //没带sequelize.transaction(function (t) 支持高并发同时操作
    //但是freeImgList是字符串类型的json数组，不能同时对同一用户进行多个操作
    //应该把这多个操作先转成一个字符串数组，在进行一次性插入修改
    DbUtil.insertFreeImgUrlById = function (id, imgUrlArray) {
        return User.findById(id, {
            attributes: ['freeImgList']
        }).then(function (user) {
            var results = Utility.encodeResults(user); //将数据库数据转成json，是个json数组
            if (results === null) {
                return;
            }

            var jsonArrayStr = results.freeImgList; //取出freeImgList字段中值，是个json数组的字符串
            if (results.freeImgList === "" || results.freeImgList === null || results.freeImgList === undefined) {
                jsonArrayStr = "[]"
            }
            var jsonArray = JSON.parse(jsonArrayStr); //将字符串转成json数组
            for (var i = 0; i < imgUrlArray.length; i++) {
                var json = {}; //定义一个json对象
                json.imgUrl = DbUtil.local_host + imgUrlArray[i]; //给json对象的imgUrl字段存入http://192.168.0.101:8081/0003.jpg
                jsonArray.push(json); //将该json加入到jsonArray的json数组里
            }
            var resultStr = JSON.stringify(jsonArray); //将json数组转成字符串
            return User.update({ //将结果更新到
                freeImgList: resultStr,
            }, {
                where: {
                    id: id
                }
            }).then(function () {

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
    //同时执行多条下面的语句，并发执行update，会执行失败，因为带了sequelize.transaction(function (t) {
    //sequelize.transaction(function (t) {的作用是？保证先后顺序，保证数据安全？最终要不要加？
    DbUtil.clearFreeImgUrlByIdTransaction = function (id, callBack) {
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
    //同时执行多条下面的语句，并发执行update，可以执行成功，因为没带sequelize.transaction(function (t) {
    //但数据不安全？
    DbUtil.clearFreeImgUrlById = function (id) {
        return User.update({ //将结果更新到
            freeImgList: '[]',
        }, {
            where: {
                id: id
            }
        }).then(function () {

        });
    };

    //对单个用户批量插入图片，插入的图片序号从fromIndex到toIndex
    //调用的是DbUtil.insertFreeImgUrlByIdTransaction，需要一条数据一条数据的处理，不支持高并发？
    DbUtil.batchInsertFreeImgUrlByIdTransaction = function (userId, fromIndex, toIndex) {
        //直接循环调用插入操作不行，因为数据操作和这些代码操作是异步的，应该先插入完一条，回调函数再插入下一条
        // for (var i = fromIndex; i < toIndex; i++) {
        //     insertFreeImgUrlById(1, 'http://192.168.1.236:8081/000' + i + '.jpg');
        // }
        //这个是插入一条数据库后的回调，继续插入一条数据
        var callBack = function (fromIndex) {
            if (fromIndex <= toIndex) {
                DbUtil.insertFreeImgUrlByIdTransaction(userId, DbUtil.local_host + fromIndex + '.jpg', callBack, ++fromIndex);
            }
        };
        callBack(fromIndex);
    };

    //对单个用户批量插入图片，插入的图片序号从fromIndex到toIndex
    //调用的是DbUtil.insertFreeImgUrlById，可以同时处理多条数据，支持高并发，安不安全？
    //注意需要先把这个多个图片先转一个字符串的json数组，再一次性插入，否则同时操作会出错
    DbUtil.batchInsertFreeImgUrlById = function (userId, fromIndex, toIndex) {
        //这个同时插入多条数据，先转成一个字符串数组
        var imgUrlArray = [];
        for (var i = fromIndex; i < toIndex; i++) {
            imgUrlArray[i - fromIndex] = i + '.jpg'
        }
        DbUtil.insertFreeImgUrlById(userId, imgUrlArray);
    };

    /**
     * 付费图片函数定义
     */

    //插入单条数据，插入数据到付费图标表中，对应操作：用户上传一张付费图片
    DbUtil.insertPayImgUrlById = function (userId, imgUrl, imgPrice) {
        sequelize.transaction(function (t) {
            return PayImgList.create({
                ownerId: userId,
                imgUrl: DbUtil.local_host + imgUrl,
                imgPrice: imgPrice
            }, {
                transaction: t
            }).then(function (payImgList) {

            });
        });
    };

    //批量插入数据到付费图片表中
    DbUtil.batchInsertPayImgUrlById = function (userId, fromIndex, toIndex, imgPrice) {
        //可以直接通过for循环执行插入操作，与批量更新user表的免费图片数据不同，那个需要在回调中一张一张插入
        for (var i = fromIndex; i <= toIndex; i++) {
            DbUtil.insertPayImgUrlById(userId, DbUtil.local_host + i + '.jpg', imgPrice);
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

    //更新数据，对应操作：编辑个人技能。
    //传入的参数是userId，以及一个json字符串，即类似"{技能名1:技能价格1,技能名2：技能价格2}"
    DbUtil.updateUserSkillsByUserId = function (userId, skillsJsonStr) {
        //本来是打逐一取出来替换，发现不用这么麻烦，将这个字符串替换即可，客户端传递完整的json字符串过来，然后进行整个替换
        //但下面的代码方法还是值得参考的，以后可以借鉴
        // return User.findById(userId, {
        //     attributes: ['skills']
        // }).then(function (user) {
        //     var results = Utility.encodeResults(user); //将数据库数据转成json，是个json数组
        //     if (results === null) {
        //         return;
        //     }
        //
        //     var jsonStr = results.skills; //取出skills字段中值，如果为空，则设置初始值为空json{}
        //     if (jsonStr === "" || jsonStr === null || jsonStr === undefined) {
        //         jsonStr = "{}"
        //     }
        //
        //     var jsonOrigin = JSON.parse(jsonStr); //将原有技能字符串转成json
        //     var jsonUpdate = JSON.parse(skillsJsonStr); //将新增加或修改的技能字符串转成json
        //     //下面是合并两个json的函数，如果有相同的key，后面一个json的值会覆盖签名那个
        //     var combineJson = function (jsonA, jsonB) {
        //         for (var obj in jsonB) { //遍历jsonB，obj是key，jsonB[obj]是对应的值
        //             jsonA[obj] = jsonB[obj];
        //         }
        //         return jsonA;
        //     }
        //
        //     var jsonResult = combineJson(jsonOrigin, jsonUpdate);
        //     var resultStr = JSON.stringify(jsonResult); //将json转成字符串
        //     console.log(resultStr);
        //     return User.update({ //将结果更新到
        //         skills: resultStr,
        //     }, {
        //         where: {
        //             id: userId
        //         }
        //     }).then(function () {
        //
        //     });
        // });
        //本来是打逐一取出来替换，发现不用这么麻烦，将这个字符串替换即可，客户端传递完整的json字符串过来，然后进行整个替换
        //但上面的代码方法还是值得参考的，以后可以借鉴
        return User.update({ //将结果更新到表中
            skills: skillsJsonStr,
        }, {
            where: {
                id: userId
            }
        }).then(function () {

        });
    };

    return DbUtil;
})();

module.exports = DbUtil;

/**
 * 要单独执行指令，请到testDb.js中
 */