var APIResult, Blacklist, Cache, Config, DataVersion, Friendship, Group, GroupMember, GroupSync, LoginLog, PayImgList,
    PayImgAndUserList, PayWeChatAndUserList, Order, MsztOrder,
    MAX_GROUP_MEMBER_COUNT, NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH,
    PORTRAIT_URI_MAX_LENGTH, PORTRAIT_URI_MIN_LENGTH, Session, User, Utility, VerificationCode, _, co, express,
    getToken, moment, qiniu, ref, regionMap, rongCloud, router, sequelize, validator,
    DbUtil, Geohash;

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

DbUtil = require('./dbUtil');

Geohash = require('ngeohash');

ref = require('../db'), sequelize = ref[0], User = ref[1], Blacklist = ref[2], Friendship = ref[3], Group = ref[4],
    GroupMember = ref[5], GroupSync = ref[6], DataVersion = ref[7], VerificationCode = ref[8], LoginLog = ref[9],
    PayImgList = ref[10], PayImgAndUserList = ref[11], PayWeChatAndUserList = ref[12], Order = ref[13], MsztOrder = ref[14];

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

//模糊查询用到的，注意安装新版，执行命令npm install sequelize@5.3.1
//同时需要执行npm install --save mysql2，看官网https://github.com/demopark/sequelize-docs-Zh-CN/blob/master/getting-started.md
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

regionMap = {
    '86': 'zh-CN'
};

getToken = function (userId, nickname, portraitUri) {
    return new Promise(function (resolve, reject) {
        return rongCloud.user.getToken(Utility.encodeId(userId), nickname, portraitUri, function (err, resultText) {
            var result;
            if (err) {
                return reject(err);
            }
            result = JSON.parse(resultText);
            if (result.code !== 200) {
                return reject(new Error('RongCloud Server API Error Code: ' + result.code));
            }
            return User.update({
                rongCloudToken: result.token
            }, {
                where: {
                    id: userId
                }
            }).then(function () {
                return resolve(result.token);
            })["catch"](function (error) {
                return reject(error);
            });
        });
    });
};

router.post('/send_code', function (req, res, next) {
    var phone, region;
    region = req.body.region;
    phone = req.body.phone;
    if (!validator.isMobilePhone(phone.toString(), regionMap[region])) {
        return res.status(400).send('Invalid region and phone number.');
    }
    return VerificationCode.getByPhone(region, phone).then(function (verification) {
        var code, subtraction, timeDiff;
        if (verification) {
            timeDiff = Math.floor((Date.now() - verification.updatedAt.getTime()) / 1000);
            if (req.app.get('env') === 'development') {
                subtraction = moment().subtract(5, 's');
            } else {
                subtraction = moment().subtract(1, 'm');
            }
            if (subtraction.isBefore(verification.updatedAt)) {
                return res.send(new APIResult(5000, null, 'Throttle limit exceeded.'));
            }
        }
        code = _.random(1000, 9999);
        if (req.app.get('env') === 'development') {
            return VerificationCode.upsert({
                region: region,
                phone: phone,
                sessionId: ''
            }).then(function () {
                return res.send(new APIResult(200));
            });
        } else if (Config.RONGCLOUD_SMS_REGISTER_TEMPLATE_ID !== '') {
            return rongCloud.sms.sendCode(region, phone, Config.RONGCLOUD_SMS_REGISTER_TEMPLATE_ID, function (err, resultText) {
                var result;
                if (err) {
                    return next(err);
                }
                result = JSON.parse(resultText);
                if (result.code !== 200) {
                    return next(new Error('RongCloud Server API Error Code: ' + result.code));
                }
                return VerificationCode.upsert({
                    region: region,
                    phone: phone,
                    sessionId: result.sessionId
                }).then(function () {
                    return res.send(new APIResult(200));
                });
            });
        }
    })["catch"](next);
});

router.post('/verify_code', function (req, res, next) {
    var code, phone, region;
    phone = req.body.phone;
    region = req.body.region;
    code = req.body.code;
    return VerificationCode.getByPhone(region, phone).then(function (verification) {
        if (!verification) {
            return res.status(404).send('Unknown phone number.');
        } else if (moment().subtract(2, 'm').isAfter(verification.updatedAt)) {
            return res.send(new APIResult(2000, null, 'Verification code expired.'));
        } else if ((req.app.get('env') === 'development' || Config.RONGCLOUD_SMS_REGISTER_TEMPLATE_ID === '') && code === '9999') {
            return res.send(new APIResult(200, {
                verification_token: verification.token
            }));
        } else {
            return rongCloud.sms.verifyCode(verification.sessionId, code, function (err, resultText) {
                var errorMessage, result;
                if (err) {
                    errorMessage = err.message;
                    if (errorMessage === 'Unsuccessful HTTP response' || errorMessage === 'Too Many Requests' || verification.sessionId === '') {
                        return res.status(err.status).send(errorMessage);
                    } else {
                        return next(err);
                    }
                }
                result = JSON.parse(resultText);
                if (result.code !== 200) {
                    return next(new Error('RongCloud Server API Error Code: ' + result.code));
                }
                if (result.success) {
                    return res.send(new APIResult(200, {
                        verification_token: verification.token
                    }));
                } else {
                    return res.send(new APIResult(1000, null, 'Invalid verification code.'));
                }
            });
        }
    })["catch"](next);
});

router.post('/check_phone_available', function (req, res, next) {
    var phone, region;
    region = req.body.region;
    phone = req.body.phone;
    if (!validator.isMobilePhone(phone.toString(), regionMap[region])) {
        return res.status(400).send('Invalid region and phone number.');
    }
    return User.checkPhoneAvailable(region, phone).then(function (result) {
        if (result) {
            return res.send(new APIResult(200, true));
        } else {
            return res.send(new APIResult(200, false, 'Phone number has already existed.'));
        }
    })["catch"](next);
});

//完善个人资料，验证码登录通过后，如果未注册的，则完善个人资料后注册
router.post('/register_code', function (req, res, next) {
    var nickname, password, verificationToken, sex;
    nickname = Utility.xss(req.body.nickname, NICKNAME_MAX_LENGTH);
    password = req.body.password;
    verificationToken = req.body.verification_token;
    sex = req.body.sex;
    console.log("register");
    console.log(nickname);
    console.log(password);
    console.log(verificationToken);
    console.log(sex);
    if (password.indexOf(' ') > 0) {
        console.log("Password must have no space.");
        return res.status(400).send('Password must have no space.');
    }
    if (!validator.isLength(nickname, NICKNAME_MIN_LENGTH, NICKNAME_MAX_LENGTH)) {
        console.log("Length of nickname invalid.");
        return res.status(400).send('Length of nickname invalid.');
    }
    if (!validator.isLength(password, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)) {
        console.log("Length of password invalid.");
        return res.status(400).send('Length of password invalid.');
    }
    if (!validator.isUUID(verificationToken)) {
        console.log("Invalid verification_token.");
        return res.status(400).send('Invalid verification_token.');
    }
    console.log("VerificationCode.getByToken");
    return VerificationCode.getByToken(verificationToken).then(function (verification) {
        if (!verification) {
            console.log("Unknown verification_token.");
            return res.status(404).send('Unknown verification_token.');
        }
        return User.checkPhoneAvailable(verification.region, verification.phone).then(function (result) {
            var hash, salt;
            if (result) {
                salt = Utility.random(1000, 9999);
                hash = Utility.hash(password, salt);
                return sequelize.transaction(function (t) {
                    return User.create({
                        nickname: nickname,
                        region: verification.region,
                        phone: verification.phone,
                        sex: sex,
                        passwordHash: hash,
                        passwordSalt: salt.toString()
                    }, {
                        transaction: t
                    }).then(function (user) {
                        return DataVersion.create({
                            userId: user.id,
                            transaction: t
                        }).then(function () {
                            Session.setAuthCookie(res, user.id);
                            Session.setNicknameToCache(user.id, nickname);
                            return res.send(new APIResult(200, Utility.encodeResults({
                                id: user.id
                            })));
                        });
                    });
                });
            } else {
                return res.status(400).send('Phone number has already existed.');
            }
        });
    })["catch"](next);
});

router.post('/register', function (req, res, next) {
    var nickname, password, verificationToken;
    nickname = Utility.xss(req.body.nickname, NICKNAME_MAX_LENGTH);
    password = req.body.password;
    verificationToken = req.body.verification_token;
    if (password.indexOf(' ') > 0) {
        return res.status(400).send('Password must have no space.');
    }
    if (!validator.isLength(nickname, NICKNAME_MIN_LENGTH, NICKNAME_MAX_LENGTH)) {
        return res.status(400).send('Length of nickname invalid.');
    }
    if (!validator.isLength(password, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)) {
        return res.status(400).send('Length of password invalid.');
    }
    if (!validator.isUUID(verificationToken)) {
        return res.status(400).send('Invalid verification_token.');
    }
    return VerificationCode.getByToken(verificationToken).then(function (verification) {
        if (!verification) {
            return res.status(404).send('Unknown verification_token.');
        }
        return User.checkPhoneAvailable(verification.region, verification.phone).then(function (result) {
            var hash, salt;
            if (result) {
                salt = Utility.random(1000, 9999);
                hash = Utility.hash(password, salt);
                return sequelize.transaction(function (t) {
                    return User.create({
                        nickname: nickname,
                        region: verification.region,
                        phone: verification.phone,
                        passwordHash: hash,
                        passwordSalt: salt.toString()
                    }, {
                        transaction: t
                    }).then(function (user) {
                        return DataVersion.create({
                            userId: user.id,
                            transaction: t
                        }).then(function () {
                            Session.setAuthCookie(res, user.id);
                            Session.setNicknameToCache(user.id, nickname);
                            return res.send(new APIResult(200, Utility.encodeResults({
                                id: user.id
                            })));
                        });
                    });
                });
            } else {
                return res.status(400).send('Phone number has already existed.');
            }
        });
    })["catch"](next);
});

//验证码登录
router.post('/code_login', function (req, res, next) {
    //判断发送过来的验证码token是否正确
    var verificationToken;
    console.log("code_login");
    verificationToken = req.body.verification_token;
    if (!validator.isUUID(verificationToken)) {
        return res.status(400).send('Invalid verification_token.');
    }
    return VerificationCode.getByToken(verificationToken).then(function (verification) {
        if (!verification) {
            console.log("yan zheng ma cuo wu");
            return res.status(404).send('Unknown verification_token.');
        } else {
            console.log("yan zheng ma zheng que");
            var region, phone;
            region = req.body.region;
            phone = req.body.phone;
            console.log(region);
            console.log(phone);
            return User.findOne({
                where: {
                    region: region,
                    phone: phone
                },
                attributes: ['id', 'passwordHash', 'passwordSalt', 'nickname', 'portraitUri', 'rongCloudToken']
            }).then(function (user) {
                var errorMessage, passwordHash;
                errorMessage = 'Invalid phone or password.';
                if (!user) {
                    console.log("wei zhu ce");
                    return res.send(new APIResult(3000, null, errorMessage));
                }
                //表示该手机号已经注册过了
                console.log("zhu ce le");
                //设置cookie？
                Session.setAuthCookie(res, user.id);
                Session.setNicknameToCache(user.id, user.nickname);
                //群组相关，暂时用不到
                GroupMember.findAll({
                    where: {
                        memberId: user.id
                    },
                    attributes: [],
                    include: {
                        model: Group,
                        where: {
                            deletedAt: null
                        },
                        attributes: ['id', 'name']
                    }
                }).then(function (groups) {
                    var groupIdNamePairs;
                    Utility.log('Sync groups: %j', groups);
                    groupIdNamePairs = {};
                    groups.forEach(function (group) {
                        return groupIdNamePairs[Utility.encodeId(group.group.id)] = group.group.name;
                    });
                    Utility.log('Sync groups: %j', groupIdNamePairs);
                    return rongCloud.group.sync(Utility.encodeId(user.id), groupIdNamePairs, function (err, resultText) {
                        if (err) {
                            return Utility.logError('Error sync user\'s group list failed: %s', err);
                        }
                    });
                })["catch"](function (error) {
                    return Utility.logError('Sync groups error: ', error);
                });
                //返回token给客户端
                if (user.rongCloudToken === '') {
                    if (req.app.get('env') === 'development') {
                        return res.send(new APIResult(200, Utility.encodeResults({
                            id: user.id,
                            token: 'fake token'
                        })));
                    }
                    return getToken(user.id, user.nickname, user.portraitUri).then(function (token) {
                        return res.send(new APIResult(200, Utility.encodeResults({
                            id: user.id,
                            token: token
                        })));
                    });
                } else {
                    return res.send(new APIResult(200, Utility.encodeResults({
                        id: user.id,
                        token: user.rongCloudToken
                    })));
                }
            })["catch"](next);

        }
    })["catch"](next);
});

router.post('/login', function (req, res, next) {
    var password, phone, region;
    region = req.body.region;
    phone = req.body.phone;
    password = req.body.password;
    console.log(region);
    console.log(phone);
    console.log(password);
    if (!validator.isMobilePhone(phone, regionMap[region])) {
        return res.status(400).send('Invalid region and phone number.');
    }
    //下面就是数据库操作
    return User.findOne({
        where: {
            region: region,
            phone: phone
        },
        attributes: ['id', 'passwordHash', 'passwordSalt', 'nickname', 'portraitUri', 'rongCloudToken']
    }).then(function (user) {
        var errorMessage, passwordHash;
        errorMessage = 'Invalid phone or password.';
        if (!user) {
            return res.send(new APIResult(1000, null, errorMessage));
        } else {
            passwordHash = Utility.hash(password, user.passwordSalt);
            if (passwordHash !== user.passwordHash) {
                return res.send(new APIResult(1000, null, errorMessage));
            }
            Session.setAuthCookie(res, user.id);
            Session.setNicknameToCache(user.id, user.nickname);
            GroupMember.findAll({
                where: {
                    memberId: user.id
                },
                attributes: [],
                include: {
                    model: Group,
                    where: {
                        deletedAt: null
                    },
                    attributes: ['id', 'name']
                }
            }).then(function (groups) {
                var groupIdNamePairs;
                Utility.log('Sync groups: %j', groups);
                groupIdNamePairs = {};
                groups.forEach(function (group) {
                    return groupIdNamePairs[Utility.encodeId(group.group.id)] = group.group.name;
                });
                Utility.log('Sync groups: %j', groupIdNamePairs);
                return rongCloud.group.sync(Utility.encodeId(user.id), groupIdNamePairs, function (err, resultText) {
                    if (err) {
                        return Utility.logError('Error sync user\'s group list failed: %s', err);
                    }
                });
            })["catch"](function (error) {
                return Utility.logError('Sync groups error: ', error);
            });
            if (user.rongCloudToken === '') {
                if (req.app.get('env') === 'development') {
                    return res.send(new APIResult(200, Utility.encodeResults({
                        id: user.id,
                        token: 'fake token'
                    })));
                }
                return getToken(user.id, user.nickname, user.portraitUri).then(function (token) {
                    return res.send(new APIResult(200, Utility.encodeResults({
                        id: user.id,
                        token: token
                    })));
                });
            } else {
                return res.send(new APIResult(200, Utility.encodeResults({
                    id: user.id,
                    token: user.rongCloudToken
                })));
            }
        }
    })["catch"](next);
});

//首页--猜你喜欢，用户信息列表
router.get('/get_recommend_users', function (req, res, next) {
    // return User.findAll({
    //     where: {},
    //     attributes: ['id', 'nickname', 'region', 'phone', 'portraitUri', 'freeImgList']
    // }).then(function (users) {
    //     var results;
    //     //如果不填keys，encodeResult函数默认会对id加sequelize.sync()密
    //     results = Utility.encodeResults(users);
    //     //打乱顺序，测试用，客户端每次刷新数据，得到结果不一样
    //     results = results.sort(function () {
    //         return 0.5 - Math.random()
    //     });
    //     return res.send(new APIResult(200, results));
    // })["catch"](next);//后面这个["catch"](next);不要忘记加


    var startIndex, pageSize, offset;
    startIndex = req.query.startIndex;
    pageSize = req.query.pageSize;
    startIndex = parseInt(startIndex); //转成整数，否则出错
    pageSize = parseInt(pageSize);
    // console.log(startIndex);
    // console.log(pageSize);
    offset = startIndex * pageSize;
    // console.log(offset);

    //可以动态设置筛选条件
    var shaixuan = {};
    var xbSelected = req.query.xbSelected;
    var fromAge = req.query.fromAge;
    var toAge = req.query.toAge;
    var fromHeight = req.query.fromHeight;
    var toHeight = req.query.toHeight;
    // console.log(xbSelected);
    // console.log(fromAge);
    // console.log(toAge);
    // console.log(fromHeight);
    // console.log(toHeight);
    if (xbSelected !== "" && xbSelected !== null && xbSelected !== undefined) {
        shaixuan.sex = xbSelected;//性别筛选
    }
    if (fromAge !== "" && fromAge !== null && fromAge !== undefined
        && toAge !== "" && toAge !== null && toAge !== undefined) {
        shaixuan.age = {
            [Op.between]: [fromAge, toAge]//范围筛选
        };
    }
    if (fromHeight !== "" && fromHeight !== null && fromHeight !== undefined
        && toHeight !== "" && toHeight !== null && toHeight !== undefined) {
        shaixuan.height = {
            [Op.between]: [fromHeight, toHeight]//范围筛选
        };
    }
    console.log(shaixuan);


    return User.findAll({
        offset: offset,
        limit: pageSize,
        attributes: ['id', 'nickname', 'portraitUri', 'sex', 'age', 'longitude', 'latitude', 'freeImgList'],
        where: shaixuan
    }).then(function (users) {
        var results = {};
        //如果不填keys，encodeResult函数默认会对id加sequelize.sync()密
        var userJsonArray = Utility.encodeResults(users); //用户json数组
        var currentUserId = Session.getCurrentUserId(req);
        //依次计算用户与请求用户之间的距离
        return User.findByPk(currentUserId, {
            attributes: ['longitude', 'latitude']
        }).then(function (ordinaryUser) {
            if (!ordinaryUser) {
                return res.status(404).send('Unknown ordinary user.');
            }
            var ordinaryResults = Utility.encodeResults(ordinaryUser);
            var ordinaryLongitude = ordinaryResults.longitude;
            var ordinaryLatitude = ordinaryResults.latitude;
            // console.log(ordinaryResults);
            //依次计算用户与请求用户之间的距离，将字段distance加进去
            for (var i = 0, length = userJsonArray.length; i < length; i++) {
                userJsonArray[i].distance =
                    GetDistance(userJsonArray[i].latitude, userJsonArray[i].longitude, ordinaryLatitude, ordinaryLongitude);//计算两点距离
            }
            results.data = userJsonArray;
            results.nextIndex = startIndex + 1;
            // console.log(results);
            return res.send(new APIResult(200, results));
        });

    })["catch"](next);//后面这个["catch"](next);不要忘记加

});

//首页--距离最近，用户信息列表
router.get('/get_nearby_users', function (req, res, next) {
    var startIndex, pageSize, offset, i;
    startIndex = req.query.startIndex;
    pageSize = req.query.pageSize;
    startIndex = parseInt(startIndex); //转成整数，否则出错
    pageSize = parseInt(pageSize);
    // console.log(startIndex);
    // console.log(pageSize);
    offset = startIndex * pageSize;
    // console.log(offset);

    //可以动态设置筛选条件，性别，年龄，身高
    var shaixuan = {};
    var xbSelected = req.query.xbSelected;
    var fromAge = req.query.fromAge;
    var toAge = req.query.toAge;
    var fromHeight = req.query.fromHeight;
    var toHeight = req.query.toHeight;
    if (xbSelected !== "" && xbSelected !== null && xbSelected !== undefined) {
        shaixuan.sex = xbSelected;//性别筛选
    }
    if (fromAge !== "" && fromAge !== null && fromAge !== undefined
        && toAge !== "" && toAge !== null && toAge !== undefined) {
        shaixuan.age = {
            [Op.between]: [fromAge, toAge]//年龄范围筛选
        };
    }
    if (fromHeight !== "" && fromHeight !== null && fromHeight !== undefined
        && toHeight !== "" && toHeight !== null && toHeight !== undefined) {
        shaixuan.height = {
            [Op.between]: [fromHeight, toHeight]//身高范围筛选
        };
    }
    // console.log(shaixuan);

    var currentUserId = Session.getCurrentUserId(req);
    //依次计算用户与请求用户之间的距离
    return User.findByPk(currentUserId, {
        attributes: ['longitude', 'latitude', 'geohash']
    }).then(function (ordinaryUser) {
        if (!ordinaryUser) {
            return res.status(404).send('Unknown ordinary user.');
        }
        var results = {}; //最终结果，包含了用户列表，分页号、分页大小之类
        var userJsonArray = []; //用户列表
        var ordinaryResults = Utility.encodeResults(ordinaryUser);
        var ordinaryLongitude = ordinaryResults.longitude;
        var ordinaryLatitude = ordinaryResults.latitude;
        var ordinaryGeohash = ordinaryResults.geohash;
        console.log(ordinaryResults);
        //得到一个数组，ordinaryGeohash的8个邻居
        var neighbors = Geohash.neighbors(ordinaryGeohash);
        //将ordinaryGeohash插入数组第一个位置，得到一个九个元素的数组
        neighbors.splice(0, 0, ordinaryGeohash);
        console.log(neighbors);
        //依次对这9个geohash进行模糊查询，得到的点就是附近的人，最后再由近到远排序
        //数据库查询是异步的，如果查完一个之后再进行下一个查询，不能直接在for循环里面调用9次查询，应该在么次查询完的then之后再调下一次查询
        //如果不需要保证这多次查询的顺序，只需关心全部查询结束后，在做操作，则可以做个执行次数标记位，直接在for循环里面执行
        var finishTimes = 0;
        for (i = 0; i < neighbors.length; i++) {
            console.log(neighbors[i] + '%');
            //除了性别、年龄、身高筛选条件，再加上geohash模糊查询
            shaixuan.geohash = {
                // 模糊查询
                [Op.like]: neighbors[i] + '%'
            };
            console.log(shaixuan);
            User.findAll({
                attributes: ['id', 'nickname', 'portraitUri', 'sex', 'age', 'longitude', 'latitude', 'geohash', 'freeImgList'],
                where: shaixuan
            }).then(function (users) {
                finishTimes++;
                var subResults = Utility.encodeResults(users);
                // console.log(subResults.length);
                //将子数组添加近最终的用户列表数组中
                userJsonArray = userJsonArray.concat(subResults);
                //最后一个查询结束，所有子数组都添加进来了
                if (finishTimes === neighbors.length) {
                    console.log("finish");
                    console.log(userJsonArray.length);
                    //依次计算用户与请求用户之间的距离，将字段distance字段加进去
                    for (var i = 0, length = userJsonArray.length; i < length; i++) {
                        userJsonArray[i].distance =
                            GetDistance(userJsonArray[i].latitude, userJsonArray[i].longitude, ordinaryLatitude, ordinaryLongitude);//计算两点距离
                    }

                    //依据距离distance字段由近到远进行排序
                    function sortDistance(a, b) {
                        return a.distance - b.distance
                    }

                    //排序
                    userJsonArray.sort(sortDistance);

                    //客户端分页拉取，只返回部分数据
                    //既不能超越结果的最大下标，也不能超过每页的大小
                    var subUserJsonArray = [];
                    for (var j = offset, k = 0, len = userJsonArray.length; j < len && k < pageSize; j++, k++) {
                        subUserJsonArray.push(userJsonArray[j]);
                    }

                    results.data = subUserJsonArray;
                    results.nextIndex = startIndex + 1;
                    // console.log(results);
                    return res.send(new APIResult(200, results));
                }
            })["catch"](next);
        }
    })["catch"](next);

});

//首页--好评优先，用户信息列表
router.get('/get_rate_users', function (req, res, next) {
    var startIndex, pageSize, offset;
    startIndex = req.query.startIndex;
    pageSize = req.query.pageSize;
    startIndex = parseInt(startIndex); //转成整数，否则出错
    pageSize = parseInt(pageSize);
    // console.log(startIndex);
    // console.log(pageSize);
    offset = startIndex * pageSize;
    // console.log(offset);

    //可以动态设置筛选条件，性别，年龄，身高
    var shaixuan = {};
    var xbSelected = req.query.xbSelected;
    var fromAge = req.query.fromAge;
    var toAge = req.query.toAge;
    var fromHeight = req.query.fromHeight;
    var toHeight = req.query.toHeight;
    if (xbSelected !== "" && xbSelected !== null && xbSelected !== undefined) {
        shaixuan.sex = xbSelected;//性别筛选
    }
    if (fromAge !== "" && fromAge !== null && fromAge !== undefined
        && toAge !== "" && toAge !== null && toAge !== undefined) {
        shaixuan.age = {
            [Op.between]: [fromAge, toAge]//范围筛选
        };
    }
    if (fromHeight !== "" && fromHeight !== null && fromHeight !== undefined
        && toHeight !== "" && toHeight !== null && toHeight !== undefined) {
        shaixuan.height = {
            [Op.between]: [fromHeight, toHeight]//范围筛选
        };
    }
    // console.log(shaixuan);

    return User.findAll({
        attributes: ['id', 'nickname', 'portraitUri', 'sex', 'age', 'longitude', 'latitude', 'feedback_rate', 'freeImgList'],
        where: shaixuan //后边一定要加条件，其实排前面的，只需那些活跃的用户即可，不然整体用户排序太耗性能
    }).then(function (users) {
        var results = {};
        var userJsonArray = Utility.encodeResults(users);

        //依据好评率由高到低排序
        function sortRate(a, b) {
            return b.feedback_rate - a.feedback_rate
        }

        //排序
        userJsonArray.sort(sortRate);

        //客户端分页拉取，只返回部分数据
        //既不能超越结果的最大下标，也不能超过每页的大小
        var subUserJsonArray = [];
        for (var j = offset, k = 0, len = userJsonArray.length; j < len && k < pageSize; j++, k++) {
            subUserJsonArray.push(userJsonArray[j]);
        }

        results.data = subUserJsonArray;
        results.nextIndex = startIndex + 1;

        console.log(results);

        //打乱顺序，测试用，客户端每次刷新数据，得到结果不一样
        // results = results.sort(function () {
        //     return 0.5 - Math.random()
        // });
        return res.send(new APIResult(200, results));
    })["catch"](next);//后面这个["catch"](next);不要忘记加

});

//详情页用户详细信息，信息只包括基本信息，免费图片，付费图片上面部分的内容；微信号、免费视频、付费视频等需要请求下面的其他接口
router.get('/get_user_detail_one', function (req, res, next) {
    var userId, currentUserId;
    userId = req.query.id;
    userId = Utility.decodeIds(userId); //先对userId解码，传过来的是一个字符串
    currentUserId = Session.getCurrentUserId(req);
    // return Cache.get("user_" + userId).then(function (user) { //先尝试从缓存中取
    //     if (user) {
    //         return res.send(new APIResult(200, user));
    //     } else {
    //         return User.findById(userId, {
    //             attributes: ['id', 'phone', 'nickname', 'portraitUri', 'freeImgList']
    //         }).then(function (user) {
    //             var results;
    //             if (!user) {
    //                 return res.status(404).send('Unknown user.');
    //             }
    //             results = Utility.encodeResults(user);//如果不填keys，encodeResult函数默认会对id加密
    //             Cache.set("user_" + userId, results); //读完后存入缓存
    //             return res.send(new APIResult(200, results));
    //         });
    //     }
    // })["catch"](next);

    //下面是先不用缓存的，以便修改数据库数据时能及时返回给客户端，上线时加上缓存
    return User.findByPk(userId, {
        attributes: ['id', 'nickname', 'sex', 'portraitUri', 'height', 'birthday', 'age', 'longitude', 'latitude', 'suoZaiDi',
            'feedback_rate', 'followNum', 'fansNum', 'qianMing', 'xqah', 'freeImgList', 'skills']
    }).then(function (user) {
        if (!user) {
            return res.status(404).send('Unknown target user.');
        }
        //计算目标用户与发起请求的用户之间的距离
        var results = Utility.encodeResults(user);
        var targetLongitude = results.longitude;
        var targetLatitude = results.latitude;
        console.log(targetLongitude);
        console.log(targetLatitude);
        return User.findByPk(currentUserId, {
            attributes: ['longitude', 'latitude']
        }).then(function (ordinaryUser) {
            if (!ordinaryUser) {
                return res.status(404).send('Unknown ordinary user.');
            }
            var ordinaryResults = Utility.encodeResults(ordinaryUser);
            var ordinaryLongitude = ordinaryResults.longitude;
            var ordinaryLatitude = ordinaryResults.latitude;
            console.log(ordinaryResults);
            results.distance = GetDistance(targetLatitude, targetLongitude, ordinaryLatitude, ordinaryLongitude);//计算两点距离
            console.log(results);
            return res.send(new APIResult(200, results));
        });

    })["catch"](next);
});

//获取用户详情，另外一半的内容，获取微信是否已经支付、付费图片、付费视频
router.get('/get_user_detail_two', function (req, res, next) {
    var userId;
    userId = req.query.id;
    userId = Utility.decodeIds(userId); //先对userId解码，传过来的是一个字符串
    return User.findByPk(userId, {
        attributes: ['id', 'weChat', 'weChatPrice']
    }).then(function (user) {
        if (!user) {
            return res.status(404).send('Unknown user.');
        }
        var results = Utility.encodeResults(user);
        var currentUserId = Session.getCurrentUserId(req);//得到当前用户的id
        var weChat = results.weChat;
        return PayWeChatAndUserList.findOne({ //查询微信是否可以查看，即是否已经付费
            where: {
                userId: currentUserId,
                weChat: weChat
            },
            attributes: ['id']
        }).then(function (payWeChatAndUserList) {
            //微信付费情况
            if (payWeChatAndUserList != null) { //表中有记录，说明已经付费，可以直接展示给用户
                results.hasPayedWeChat = true;
            } else {
                results.hasPayedWeChat = false;
            }

            //付费图片付费情况
            return PayImgList.findAll({
                where: {
                    ownerId: userId
                },
                attributes: ['id', 'imgUrl', 'imgPrice']
            }).then(function (payImgs) {
                // if (!payImgs) { //不需要做判空操作，如果没数据，findAll操作默认会返回一个空数组
                // }
                return PayImgAndUserList.findAll({ //查询当前用户有哪些已经付费的图片
                    where: {
                        userId: currentUserId
                    },
                    attributes: [],
                    include: {
                        model: PayImgList,
                        attributes: ['id', 'imgUrl', 'imgPrice']
                    }
                }).then(function (currentUserHasPayedImgs) {
                        payImgs = Utility.encodeResultsNoKeys(payImgs);//将想查看的用户的付费图片转成json数组，用了自己写的函数，即不对id，方便与下面的id比较
                        currentUserHasPayedImgs = Utility.encodeResults(currentUserHasPayedImgs); //将当前用户已经付费的图片转成json数组
                        var isImgHasPayed = function (imgId) { //判断想查看的付费图片是否已经付费
                            for (var i = 0, length = currentUserHasPayedImgs.length; i < length; i++) {
                                if (imgId === currentUserHasPayedImgs[i].pay_img.id) {
                                    return true;
                                }
                            }
                            return false;
                        };
                        var notPayedImgList = []; //还未付费的图片，在客户端上显示模糊
                        var hasPayedImgList = []; //已付费的图片，在客户端上正常展示，与免费图片不一样
                        // var jsonArrayStr = results.freeImgList; //免费图片，将已付费的图片也加入到免费图片中，客户端可以正常显示
                        // var freeImgList = JSON.parse(jsonArrayStr);

                        for (var i = 0, length = payImgs.length; i < length; i++) {
                            if (isImgHasPayed(payImgs[i].id)) {
                                var json = {};
                                json.imgUrl = payImgs[i].imgUrl;
                                hasPayedImgList.push(json);
                            } else {
                                notPayedImgList.push(payImgs[i]);
                            }

                        }
                        // var freeImgListResult = JSON.stringify(freeImgList); //将json数组转成字符串
                        // results.freeImgList = freeImgListResult; //免费图片加上已付费的图片
                        // notPayedImgList = Utility.encodeResults(notPayedImgList);
                        results.notPayedImgList = notPayedImgList; //还未付费的图片
                        results.hasPayedImgList = hasPayedImgList; //还未付费的图片
                        console.log(results);
                        console.log("get_user_detail_two_success");
                        return res.send(new APIResult(200, results));
                    }
                );
            });


            console.log("get_user_detail_two_success");
            return res.send(new APIResult(200, results));
        });
    })["catch"](next);
});

//用户支付付费图片
router.post('/user_pay_img', function (req, res, next) {
    console.log("user_pay_img");
    var imgId = req.body.image;
    // imgId = Utility.decodeIds(imgId);//不需要这句解密的代码，上面body.imgId直接给解密了？
    var currentUserId = Session.getCurrentUserId(req);
    console.log(imgId);
    return sequelize.transaction(function (t) {
        return PayImgAndUserList.create({
            userId: currentUserId,
            imgId: imgId
        }, {
            transaction: t
        }).then(function () {
            //经过实践，在这里做返回，数据不一定已经插入到表里，在下面的then中做返回，能保证数据先插入到表内，再做返回
        });
    }).then(function (result) {
        // 事务已被提交
        // result 是 promise 链返回到事务回调的结果
        //网址：https://github.com/demopark/sequelize-docs-Zh-CN/blob/master/transactions.md
        res.send(new APIResult(200));
    })["catch"](next);
});

//用户支付微信号
router.post('/user_pay_wechat', function (req, res, next) {
    console.log("user_pay_wechat");
    var weChat = req.body.weChat;
    var weChatPrice = req.body.weChatPrice;
    var currentUserId = Session.getCurrentUserId(req);
    return sequelize.transaction(function (t) {
        return PayWeChatAndUserList.create({
            userId: currentUserId,
            weChat: weChat,
            weChatPrice: weChatPrice
        }, {
            transaction: t
        }).then(function () {
            //经过实践，在这里做返回，数据不一定已经插入到表里，在下面的then中做返回，能保证数据先插入到表内，再做返回
        });
    }).then(function (result) {
        // 事务已被提交
        // result 是 promise 链返回到事务回调的结果
        //网址：https://github.com/demopark/sequelize-docs-Zh-CN/blob/master/transactions.md
        res.send(new APIResult(200));
    })["catch"](next);
});

//详情页获取付费图片列表中哪些图片是该用户已经付费的，如果未付费，则客户端模糊展示
router.get('/get_imgpay_info', function (req, res, next) {
    console.log("get_imgpay_info");

    return res.send(new APIResult(200, Utility.encodeResults({
        token: 'fake token'
    })));
});

//个人编辑页，修改用户信息
//testDb.js中的batchInsertFreeImgUrlById（系列插入免费图片）、updateUserInfoById（更新用户基本信息）
//batchInsertFreeImgUrlById是为了方便插入假数据编写的，实际中，客户端直接传最终的json字符串过来直接更新该字段即可
//注意，更新用户名、头像没这么简单，涉及融云那边的更新，看下面就知道了，先写着看到效果，以后再说
router.post('/update_user_info', function (req, res, next) {
    console.log("update_user_info");
    //前期记得做一下校验，参考一下下面的设置昵称，头像的函数
    //这里我为了方便直接更新里，就当客户端传来了合法的数据
    var currentUserId = Session.getCurrentUserId(req);
    var timestamp = Date.now();
    return User.update({ //将结果更新到数据库
        nickname: req.body.nickname,
        portraitUri: req.body.portraitUri,
        sex: req.body.sex,
        height: req.body.height,
        birthday: req.body.birthday,
        age: req.body.age,
        suoZaiDi: req.body.suoZaiDi,
        qianMing: req.body.qianMing,
        xqah: req.body.xqah,
        freeImgList: req.body.freeImgList,
        timestamp: timestamp
    }, {
        where: {
            id: currentUserId
        }
    }).then(function () {
        return res.send(new APIResult(200));
    })["catch"](next);
});

//用户位置更新，客户端那边每2分钟以上才能定位一次，如果定位的新位置距离旧位置超过500米，则上传新位置到服务器
router.post('/update_user_location', function (req, res, next) {
    console.log("update_user_location");
    var currentUserId = Session.getCurrentUserId(req);
    var geohash = Geohash.encode(req.body.latitude, req.body.longitude, 4)
    var timestamp = Date.now();
    return User.update({ //将结果更新到数据库
        longitude: req.body.longitude,
        latitude: req.body.latitude,
        geohash: geohash,
        timestamp: timestamp
    }, {
        where: {
            id: currentUserId
        }
    }).then(function () {
        return res.send(new APIResult(200));
    })["catch"](next);
});

//马上租Ta，付费接口（应该是微信支付成功后再调用这个接口），这个接口调用成功后，再调用马上租Ta，下单接口
router.post('/mszt_pay', function (req, res, next) {
    console.log("mszt_pay");
    var currentUserId = Session.getCurrentUserId(req);
    return res.send(new APIResult(200));
});

//马上租Ta，付完预付款后，创建订单接口，（现在还未确定是先生成订单id再去支付，还是先支付完再创建订单）
router.post('/mszt_create_order', function (req, res, next) {
    console.log("mszt_create_order");
    var getOrderId = function (userId) {
        // 获取20位字符串类型的订单号，10位时间戳+10位userId
        var getTenBitId = function (userId) {
            //获取十位数的id，不够十位用0填充
            var tenBit = 10000000000;
            var resultId = "" + userId;
            for (var i = 1; i < 10; i++) {
                if (userId < tenBit) {
                    resultId = resultId + "0"; //把0放到末尾，防止用户通过末尾数字来判断出userId
                    tenBit = tenBit / 10;
                } else {
                    break;
                }
            }
            return resultId;
        };
        //单位是秒，时间戳是10位，parseInt强制将double转为int，丢弃小数部分
        var timestamp = parseInt(Date.now() / 1000);
        timestamp = timestamp + "";
        var tenBitId = getTenBitId(userId);
        return timestamp + tenBitId;
    };
    var currentUserId = Session.getCurrentUserId(req);
    var receiveUserId = Utility.decodeIds(req.body.receiveUserId);
    var msztOrderId = getOrderId(currentUserId);
    // console.log(msztOrderId);//订单号
    return MsztOrder.create({ //将结果更新到数据库
        MsztOrderId: msztOrderId,
        payUserId: currentUserId,
        receiveUserId: receiveUserId,
        status: req.body.status,
        yysj: req.body.yysj,
        yysc: req.body.yysc,
        longitude: req.body.longitude,
        latitude: req.body.latitude,
        yydd: req.body.yydd,
        advancePayment: req.body.advancePayment,
        totalPayment: req.body.totalPayment,
        yfkTs: req.body.yfkTs,
        jsTs: req.body.jsTs,
        qrTs: req.body.qrTs,
        zzTs: req.body.zzTs,
        wjstkTs: req.body.wjstkTs,
        wfqktkTs: req.body.wfqktkTs,
        jftkTs: req.body.jftkTs,
    }, {
        where: {
            id: currentUserId
        }
    }).then(function (msztOrder) {
        return res.send(new APIResult(200));
    })["catch"](next);
});

router.post('/logout', function (req, res) {
    res.clearCookie(Config.AUTH_COOKIE_NAME);
    return res.send(new APIResult(200));
});

router.post('/reset_password', function (req, res, next) {
    var password, verificationToken;
    password = req.body.password;
    verificationToken = req.body.verification_token;
    if (password.indexOf(' ') !== -1) {
        return res.status(400).send('Password must have no space.');
    }
    if (!validator.isLength(password, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)) {
        return res.status(400).send('Length of password invalid.');
    }
    if (!validator.isUUID(verificationToken)) {
        return res.status(400).send('Invalid verification_token.');
    }
    return VerificationCode.getByToken(verificationToken).then(function (verification) {
        var hash, salt;
        if (!verification) {
            return res.status(404).send('Unknown verification_token.');
        }
        salt = _.random(1000, 9999);
        hash = Utility.hash(password, salt);
        return User.update({
            passwordHash: hash,
            passwordSalt: salt.toString()
        }, {
            where: {
                region: verification.region,
                phone: verification.phone
            }
        }).then(function () {
            return res.send(new APIResult(200));
        });
    })["catch"](next);
});

router.post('/change_password', function (req, res, next) {
    var newPassword, oldPassword;
    newPassword = req.body.newPassword;
    oldPassword = req.body.oldPassword;
    if (newPassword.indexOf(' ') !== -1) {
        return res.status(400).send('New password must have no space.');
    }
    if (!validator.isLength(newPassword, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)) {
        return res.status(400).send('Invalid new password length.');
    }
    return User.findById(Session.getCurrentUserId(req, {
        attributes: ['id', 'passwordHash', 'passwordSalt']
    })).then(function (user) {
        var newHash, newSalt, oldHash;
        oldHash = Utility.hash(oldPassword, user.passwordSalt);
        if (oldHash !== user.passwordHash) {
            return res.send(new APIResult(1000, null, 'Wrong old password.'));
        }
        newSalt = _.random(1000, 9999);
        newHash = Utility.hash(newPassword, newSalt);
        return user.update({
            passwordHash: newHash,
            passwordSalt: newSalt.toString()
        }).then(function () {
            return res.send(new APIResult(200));
        });
    })["catch"](next);
});

router.post('/set_nickname', function (req, res, next) {
    var currentUserId, nickname, timestamp;
    nickname = Utility.xss(req.body.nickname, NICKNAME_MAX_LENGTH);
    if (!validator.isLength(nickname, NICKNAME_MIN_LENGTH, NICKNAME_MAX_LENGTH)) {
        return res.status(400).send('Invalid nickname length.');
    }
    currentUserId = Session.getCurrentUserId(req);
    timestamp = Date.now();
    return User.update({
        nickname: nickname,
        timestamp: timestamp
    }, {
        where: {
            id: currentUserId
        }
    }).then(function () {
        rongCloud.user.refresh(Utility.encodeId(currentUserId), nickname, null, function (err, resultText) {
            var result;
            if (err) {
                Utility.logError('RongCloud Server API Error: ', err.message);
            }
            result = JSON.parse(resultText);
            if (result.code !== 200) {
                return Utility.logError('RongCloud Server API Error Code: ', result.code);
            }
        });
        Session.setNicknameToCache(currentUserId, nickname);
        return Promise.all([DataVersion.updateUserVersion(currentUserId, timestamp), DataVersion.updateAllFriendshipVersion(currentUserId, timestamp)]).then(function () {
            Cache.del("user_" + currentUserId);
            Cache.del("friendship_profile_user_" + currentUserId);
            Friendship.findAll({
                where: {
                    userId: currentUserId
                },
                attributes: ['friendId']
            }).then(function (friends) {
                return friends.forEach(function (friend) {
                    return Cache.del("friendship_all_" + friend.friendId);
                });
            });
            GroupMember.findAll({
                where: {
                    memberId: currentUserId,
                    isDeleted: false
                },
                attributes: ['groupId']
            }).then(function (groupMembers) {
                return groupMembers.forEach(function (groupMember) {
                    return Cache.del("group_members_" + groupMember.groupId);
                });
            });
            return res.send(new APIResult(200));
        });
    })["catch"](next);
});

router.post('/set_portrait_uri', function (req, res, next) {
    var currentUserId, portraitUri, timestamp;
    portraitUri = Utility.xss(req.body.portraitUri, PORTRAIT_URI_MAX_LENGTH);
    if (!validator.isURL(portraitUri, {
        protocols: ['http', 'https'],
        require_protocol: true
    })) {
        return res.status(400).send('Invalid portraitUri format.');
    }
    if (!validator.isLength(portraitUri, PORTRAIT_URI_MIN_LENGTH, PORTRAIT_URI_MAX_LENGTH)) {
        return res.status(400).send('Invalid portraitUri length.');
    }
    currentUserId = Session.getCurrentUserId(req);
    timestamp = Date.now();
    return User.update({
        portraitUri: portraitUri,
        timestamp: timestamp
    }, {
        where: {
            id: currentUserId
        }
    }).then(function () {
        rongCloud.user.refresh(Utility.encodeId(currentUserId), null, portraitUri, function (err, resultText) {
            var result;
            if (err) {
                Utility.logError('RongCloud Server API Error: ', err.message);
            }
            result = JSON.parse(resultText);
            if (result.code !== 200) {
                return Utility.logError('RongCloud Server API Error Code: ', result.code);
            }
        });
        return Promise.all([DataVersion.updateUserVersion(currentUserId, timestamp), DataVersion.updateAllFriendshipVersion(currentUserId, timestamp)]).then(function () {
            Cache.del("user_" + currentUserId);
            Cache.del("friendship_profile_user_" + currentUserId);
            Friendship.findAll({
                where: {
                    userId: currentUserId
                },
                attributes: ['friendId']
            }).then(function (friends) {
                return friends.forEach(function (friend) {
                    return Cache.del("friendship_all_" + friend.friendId);
                });
            });
            GroupMember.findAll({
                where: {
                    memberId: currentUserId,
                    isDeleted: false
                },
                attributes: ['groupId']
            }).then(function (groupMembers) {
                return groupMembers.forEach(function (groupMember) {
                    return Cache.del("group_members_" + groupMember.groupId);
                });
            });
            return res.send(new APIResult(200));
        });
    })["catch"](next);
});

router.post('/add_to_blacklist', function (req, res, next) {
    var currentUserId, encodedFriendId, friendId, timestamp;
    friendId = req.body.friendId;
    encodedFriendId = req.body.encodedFriendId;
    currentUserId = Session.getCurrentUserId(req);
    timestamp = Date.now();
    return User.checkUserExists(friendId).then(function (result) {
        if (result) {
            return rongCloud.user.blacklist.add(Utility.encodeId(currentUserId), encodedFriendId, function (err, resultText) {
                if (err) {
                    return next(err);
                } else {
                    return Blacklist.upsert({
                        userId: currentUserId,
                        friendId: friendId,
                        status: true,
                        timestamp: timestamp
                    }).then(function () {
                        return DataVersion.updateBlacklistVersion(currentUserId, timestamp).then(function () {
                            Cache.del("user_blacklist_" + currentUserId);
                            return res.send(new APIResult(200));
                        });
                    });
                }
            });
        } else {
            return res.status(404).send('friendId is not an available userId.');
        }
    })["catch"](next);
});

router.post('/remove_from_blacklist', function (req, res, next) {
    var currentUserId, encodedFriendId, friendId, timestamp;
    friendId = req.body.friendId;
    encodedFriendId = req.body.encodedFriendId;
    currentUserId = Session.getCurrentUserId(req);
    timestamp = Date.now();
    return rongCloud.user.blacklist.remove(Utility.encodeId(currentUserId), encodedFriendId, function (err, resultText) {
        if (err) {
            return next(err);
        } else {
            return Blacklist.update({
                status: false,
                timestamp: timestamp
            }, {
                where: {
                    userId: currentUserId,
                    friendId: friendId
                }
            }).then(function () {
                return DataVersion.updateBlacklistVersion(currentUserId, timestamp).then(function () {
                    Cache.del("user_blacklist_" + currentUserId);
                    return res.send(new APIResult(200));
                });
            })["catch"](next);
        }
    });
});

router.post('/upload_contacts', function (req, res, next) {
    var contacts;
    contacts = req.body;
    return res.status(404).send('Not implements.');
});

router.get('/get_token', function (req, res, next) {
    return User.findById(Session.getCurrentUserId(req, {
        attributes: ['id', 'nickname', 'portraitUri']
    })).then(function (user) {
        return getToken(user.id, user.nickname, user.portraitUri).then(function (token) {
            return res.send(new APIResult(200, Utility.encodeResults({
                userId: user.id,
                token: token
            }, 'userId')));
        });
    })["catch"](next);
});

router.get('/get_image_token', function (req, res, next) {
    var putPolicy, token;
    qiniu.conf.ACCESS_KEY = Config.QINIU_ACCESS_KEY;
    qiniu.conf.SECRET_KEY = Config.QINIU_SECRET_KEY;
    putPolicy = new qiniu.rs.PutPolicy(Config.QINIU_BUCKET_NAME);
    token = putPolicy.token();
    return res.send(new APIResult(200, {
        target: 'qiniu',
        domain: Config.QINIU_BUCKET_DOMAIN,
        token: token
    }));
});

router.get('/get_sms_img_code', function (req, res, next) {
    rongCloud.sms.getImgCode(Config.RONGCLOUD_APP_KEY, function (err, resultText) {
        var result;
        if (err) {
            return next(err);
        }
        result = JSON.parse(resultText);
        if (result.code !== 200) {
            return next(new Error('RongCloud Server API Error Code: ' + result.code));
        }
    });
    return res.send(new APIResult(200, {
        url: result.url,
        verifyId: result.verifyId
    }));
});

router.get('/blacklist', function (req, res, next) {
    var currentUserId, timestamp;
    currentUserId = Session.getCurrentUserId(req);
    timestamp = Date.now();
    return Cache.get("user_blacklist_" + currentUserId).then(function (blacklist) {
        if (blacklist) {
            return res.send(new APIResult(200, blacklist));
        } else {
            return Blacklist.findAll({
                where: {
                    userId: currentUserId,
                    friendId: {
                        $ne: 0
                    },
                    status: true
                },
                attributes: [],
                include: {
                    model: User,
                    attributes: ['id', 'nickname', 'portraitUri', 'updatedAt']
                }
            }).then(function (dbBlacklist) {
                var results;
                rongCloud.user.blacklist.query(Utility.encodeId(currentUserId), function (err, resultText) {
                    var dbBlacklistUserIds, hasDirtyData, result, serverBlacklistUserIds;
                    if (err) {
                        return Utility.logError('Error: request server blacklist failed: %s', err);
                    } else {
                        result = JSON.parse(resultText);
                        if (result.code === 200) {
                            hasDirtyData = false;
                            serverBlacklistUserIds = result.users;
                            dbBlacklistUserIds = dbBlacklist.map(function (blacklist) {
                                if (blacklist.user) {
                                    return blacklist.user.id;
                                } else {
                                    hasDirtyData = true;
                                    return null;
                                }
                            });
                            if (hasDirtyData) {
                                Utility.log('Dirty blacklist data %j', dbBlacklist);
                            }
                            serverBlacklistUserIds.forEach(function (encodedUserId) {
                                var userId;
                                userId = Utility.decodeIds(encodedUserId);
                                if (dbBlacklistUserIds.indexOf(userId) === -1) {
                                    return Blacklist.create({
                                        userId: currentUserId,
                                        friendId: userId,
                                        status: true,
                                        timestamp: timestamp
                                    }).then(function () {
                                        Utility.log('Sync: fix user blacklist, add %s -> %s from db.', currentUserId, userId);
                                        return DataVersion.updateBlacklistVersion(currentUserId, timestamp);
                                    })["catch"](function () {
                                    });
                                }
                            });
                            return dbBlacklistUserIds.forEach(function (userId) {
                                if (userId && serverBlacklistUserIds.indexOf(Utility.encodeId(userId)) === -1) {
                                    return Blacklist.update({
                                        status: false,
                                        timestamp: timestamp
                                    }, {
                                        where: {
                                            userId: currentUserId,
                                            friendId: userId
                                        }
                                    }).then(function () {
                                        Utility.log('Sync: fix user blacklist, remove %s -> %s from db.', currentUserId, userId);
                                        return DataVersion.updateBlacklistVersion(currentUserId, timestamp);
                                    });
                                }
                            });
                        }
                    }
                });
                results = Utility.encodeResults(dbBlacklist, [['user', 'id']]);
                Cache.set("user_blacklist_" + currentUserId, results);
                return res.send(new APIResult(200, results));
            });
        }
    })["catch"](next);
});

router.get('/groups', function (req, res, next) {
    var currentUserId;
    currentUserId = Session.getCurrentUserId(req);
    return Cache.get("user_groups_" + currentUserId).then(function (groups) {
        if (groups) {
            return res.send(new APIResult(200, groups));
        } else {
            return GroupMember.findAll({
                where: {
                    memberId: currentUserId
                },
                attributes: ['role'],
                include: [
                    {
                        model: Group,
                        attributes: ['id', 'name', 'portraitUri', 'creatorId', 'memberCount', 'maxMemberCount']
                    }
                ]
            }).then(function (groups) {
                var results;
                results = Utility.encodeResults(groups, [['group', 'id'], ['group', 'creatorId']]);
                Cache.set("user_groups_" + currentUserId, results);
                return res.send(new APIResult(200, results));
            });
        }
    })["catch"](next);
});

router.get('/sync/:version', function (req, res, next) {
    var blacklist, currentUserId, friends, groupMembers, groups, maxVersions, user, version;
    version = req.params.version;
    if (!validator.isInt(version)) {
        return res.status(400).send('Version parameter is not integer.');
    }
    user = blacklist = friends = groups = groupMembers = null;
    maxVersions = [];
    currentUserId = Session.getCurrentUserId(req);
    return DataVersion.findById(currentUserId).then(function (dataVersion) {
        return co(function* () {
            var groupIds, group_members;
            if (dataVersion.userVersion > version) {
                user = (yield User.findById(currentUserId, {
                    attributes: ['id', 'nickname', 'portraitUri', 'timestamp']
                }));
            }
            if (dataVersion.blacklistVersion > version) {
                blacklist = (yield Blacklist.findAll({
                    where: {
                        userId: currentUserId,
                        timestamp: {
                            $gt: version
                        }
                    },
                    attributes: ['friendId', 'status', 'timestamp'],
                    include: [
                        {
                            model: User,
                            attributes: ['id', 'nickname', 'portraitUri']
                        }
                    ]
                }));
            }
            if (dataVersion.friendshipVersion > version) {
                friends = (yield Friendship.findAll({
                    where: {
                        userId: currentUserId,
                        timestamp: {
                            $gt: version
                        }
                    },
                    attributes: ['friendId', 'displayName', 'status', 'timestamp'],
                    include: [
                        {
                            model: User,
                            attributes: ['id', 'nickname', 'portraitUri']
                        }
                    ]
                }));
            }
            if (dataVersion.groupVersion > version) {
                groups = (yield GroupMember.findAll({
                    where: {
                        memberId: currentUserId,
                        timestamp: {
                            $gt: version
                        }
                    },
                    attributes: ['groupId', 'displayName', 'role', 'isDeleted'],
                    include: [
                        {
                            model: Group,
                            attributes: ['id', 'name', 'portraitUri', 'timestamp']
                        }
                    ]
                }));
            }
            if (groups) {
                groupIds = groups.map(function (group) {
                    return group.group.id;
                });
            } else {
                groupIds = [];
            }
            if (dataVersion.groupVersion > version) {
                groupMembers = (yield GroupMember.findAll({
                    where: {
                        groupId: {
                            $in: groupIds
                        },
                        timestamp: {
                            $gt: version
                        }
                    },
                    attributes: ['groupId', 'memberId', 'displayName', 'role', 'isDeleted', 'timestamp'],
                    include: [
                        {
                            model: User,
                            attributes: ['id', 'nickname', 'portraitUri']
                        }
                    ]
                }));
            }
            if (user) {
                maxVersions.push(user.timestamp);
            }
            if (blacklist) {
                maxVersions.push(_.max(blacklist, function (item) {
                    return item.timestamp;
                }).timestamp);
            }
            if (friends) {
                maxVersions.push(_.max(friends, function (item) {
                    return item.timestamp;
                }).timestamp);
            }
            if (groups) {
                maxVersions.push(_.max(groups, function (item) {
                    return item.group.timestamp;
                }).group.timestamp);
            }
            if (groupMembers) {
                maxVersions.push(_.max(groupMembers, function (item) {
                    return item.timestamp;
                }).timestamp);
            }
            if (blacklist === null) {
                blacklist = [];
            }
            if (friends === null) {
                friends = [];
            }
            if (groups === null) {
                groups = [];
            }
            if (group_members === null) {
                group_members = [];
            }
            Utility.log('maxVersions: %j', maxVersions);
            return res.send(new APIResult(200, {
                version: _.max(maxVersions),
                user: user,
                blacklist: blacklist,
                friends: friends,
                groups: groups,
                group_members: groupMembers
            }));
        });
    })["catch"](next);
});

router.get('/batch', function (req, res, next) {
    var ids;
    ids = req.query.id;
    if (!Array.isArray(ids)) {
        ids = [ids];
    }
    ids = Utility.decodeIds(ids);
    return User.findAll({
        where: {
            id: {
                $in: ids
            }
        },
        attributes: ['id', 'nickname', 'portraitUri']
    }).then(function (users) {
        return res.send(new APIResult(200, Utility.encodeResults(users)));
    })["catch"](next);
});

//router.param([name], callback)，router对象的param方法用于路径参数的处理
//这个接口是同步个人信息，对应客户端登录时的SYNC_USER_INFO请求
//注意，新加的user/xxx请求一定要放在这个请求之前，否则会默认匹配到这个请求，然后返回错误信息
router.get('/:id', function (req, res, next) {
    var userId;
    userId = req.params.id;
    userId = Utility.decodeIds(userId);
    return Cache.get("user_" + userId).then(function (user) {
        if (user) {
            return res.send(new APIResult(200, user));
        } else {
            return User.findByPk(userId, {
                attributes: ['id', 'nickname', 'portraitUri']
            }).then(function (user) {
                var results;
                if (!user) {
                    return res.status(404).send('Unknown user.');
                }
                results = Utility.encodeResults(user);
                Cache.set("user_" + userId, results);
                return res.send(new APIResult(200, results));
            });
        }
    })["catch"](next);
});

router.get('/find/:region/:phone', function (req, res, next) {
    var phone, region;
    region = req.params.region;
    phone = req.params.phone;
    if (!validator.isMobilePhone(phone, regionMap[region])) {
        return res.status(400).send('Invalid region and phone number.');
    }
    return User.findOne({
        where: {
            region: region,
            phone: phone
        },
        attributes: ['id', 'nickname', 'portraitUri']
    }).then(function (user) {
        if (!user) {
            return res.status(404).send('Unknown user.');
        }
        return res.send(new APIResult(200, Utility.encodeResults(user)));
    })["catch"](next);
});

function Rad(d) {
    return d * Math.PI / 180.0;//经纬度转换成三角函数中度分表形式。
}

//计算距离，参数分别为第一点的纬度，经度；第二点的纬度，经度
function GetDistance(lat1, lng1, lat2, lng2) {
    var radLat1 = Rad(lat1);
    var radLat2 = Rad(lat2);
    var a = radLat1 - radLat2;
    var b = Rad(lng1) - Rad(lng2);
    var s = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(a / 2), 2) +
        Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2)));
    s = s * 6378.137;// EARTH_RADIUS;
    s = Math.round(s * 10000) / 10000; //输出为公里
    //s=s.toFixed(4);
    return s;
}

module.exports = router;
