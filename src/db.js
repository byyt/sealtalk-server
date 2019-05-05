var Blacklist, Config, DataVersion, Friendship, GROUP_CREATOR, GROUP_MEMBER, Group, GroupMember, GroupSync, HTTPError,
    LoginLog, Sequelize, User, Utility, VerificationCode, _, co, dataVersionClassMethods, friendshipClassMethods,
    groupClassMethods,
    groupMemberClassMethods, sequelize, userClassMethods, verificationCodeClassMethods,
    PayImgList, PayImgAndUserList, payImgListClassMethods, payImgAndUserListClassMethods,
    PayWeChatAndUserList, Order, MsztOrder;

Sequelize = require('sequelize');

co = require('co');

_ = require('underscore');

Config = require('./conf');

Utility = require('./util/util').Utility;

HTTPError = require('./util/util').HTTPError;

GROUP_CREATOR = 0;

GROUP_MEMBER = 1;

sequelize = new Sequelize(Config.DB_NAME, Config.DB_USER, Config.DB_PASSWORD, {
    host: Config.DB_HOST,
    port: Config.DB_PORT,
    dialect: 'mysql',
    timezone: '+08:00',
    logging: null
});

userClassMethods = {
    getNicknames: function (userIds) {
        return User.findAll({
            where: {
                id: {
                    $in: userIds
                }
            },
            attributes: ['id', 'nickname']
        }).then(function (users) {
            return userIds.map(function (userId) {
                return _.find(users, function (user) {
                    return user.id === userId;
                }).nickname;
            });
        });
    },
    getNickname: function (userId) {
        return User.findById(userId, {
            attributes: ['nickname']
        }).then(function (user) {
            if (user) {
                return user.nickname;
            } else {
                return null;
            }
        });
    },
    checkUserExists: function (userId) {
        return User.count({
            where: {
                id: userId
            }
        }).then(function (count) {
            return count === 1;
        });
    },
    checkPhoneAvailable: function (region, phone) {
        return User.count({
            where: {
                region: region,
                phone: phone
            }
        }).then(function (count) {
            return count === 0;
        });
    }
};

payImgListClassMethods = {
    getPayImgUrlById: function (imgId) {
        return PayImgList.findOne({
            where: {
                id: imgId
            },
            attributes: ['id', 'ownerId', 'imgUrl']
        });
    },
    getPayImgUrlsByUserId: function (userId) {
        return PayImgList.findAll({
            where: {
                ownerId: userId
            },
            attributes: ['id', 'ownerId', 'imgUrl']
        });
    }
};

payImgAndUserListClassMethods = {
    getPayImgUrlById: function (userId, friendId) {
        return Friendship.findOne({
            where: {
                userId: userId,
                friendId: friendId
            },
            attributes: ['id', 'status', 'message', 'timestamp', 'updatedAt']
        });
    }
};

friendshipClassMethods = {
    getInfo: function (userId, friendId) {
        return Friendship.findOne({
            where: {
                userId: userId,
                friendId: friendId
            },
            attributes: ['id', 'status', 'message', 'timestamp', 'updatedAt']
        });
    }
};

groupClassMethods = {
    getInfo: function (groupId) {
        return Group.findById(groupId, {
            attributes: ['id', 'name', 'creatorId', 'memberCount']
        });
    }
};

groupMemberClassMethods = {
    bulkUpsert: function (groupId, memberIds, timestamp, transaction, creatorId) {
        return co(function* () {
            var createGroupMembers, groupMembers, roleFlag, updateGroupMemberIds;
            groupMembers = (yield GroupMember.unscoped().findAll({
                where: {
                    groupId: groupId
                },
                attributes: ['memberId', 'isDeleted']
            }));
            createGroupMembers = [];
            updateGroupMemberIds = [];
            roleFlag = GROUP_MEMBER;
            memberIds.forEach(function (memberId) {
                var isUpdateMember;
                if (Utility.isEmpty(memberId)) {
                    throw new HTTPError('Empty memberId in memberIds.', 400);
                }
                if (memberId === creatorId) {
                    roleFlag = GROUP_CREATOR;
                }
                isUpdateMember = false;
                groupMembers.some(function (groupMember) {
                    if (memberId === groupMember.memberId) {
                        if (!groupMember.isDeleted) {
                            throw new HTTPError('Should not add exist member to the group.', 400);
                        }
                        return isUpdateMember = true;
                    } else {
                        return false;
                    }
                });
                if (isUpdateMember) {
                    return updateGroupMemberIds.push(memberId);
                } else {
                    return createGroupMembers.push({
                        groupId: groupId,
                        memberId: memberId,
                        role: memberId === creatorId ? GROUP_CREATOR : GROUP_MEMBER,
                        timestamp: timestamp
                    });
                }
            });
            if (creatorId !== void 0 && roleFlag === GROUP_MEMBER) {
                throw new HTTPError('Creator is not in memeber list.', 400);
            }
            if (updateGroupMemberIds.length > 0) {
                (yield GroupMember.unscoped().update({
                    role: GROUP_MEMBER,
                    isDeleted: false,
                    timestamp: timestamp
                }, {
                    where: {
                        groupId: groupId,
                        memberId: {
                            $in: updateGroupMemberIds
                        }
                    },
                    transaction: transaction
                }));
            }
            return (yield GroupMember.bulkCreate(createGroupMembers, {
                transaction: transaction
            }));
        });
    },
    getGroupCount: function (userId) {
        return GroupMember.count({
            where: {
                memberId: userId
            }
        });
    }
};

dataVersionClassMethods = {
    updateUserVersion: function (userId, timestamp) {
        return DataVersion.update({
            userVersion: timestamp
        }, {
            where: {
                userId: userId
            }
        });
    },
    updateBlacklistVersion: function (userId, timestamp) {
        return DataVersion.update({
            blacklistVersion: timestamp
        }, {
            where: {
                userId: userId
            }
        });
    },
    updateFriendshipVersion: function (userId, timestamp) {
        return DataVersion.update({
            friendshipVersion: timestamp
        }, {
            where: {
                userId: userId
            }
        });
    },
    updateAllFriendshipVersion: function (userId, timestamp) {
        return sequelize.query('UPDATE data_versions d JOIN friendships f ON d.userId = f.userId AND f.friendId = ? AND f.status = 20 SET d.friendshipVersion = ?', {
            replacements: [userId, timestamp],
            type: Sequelize.QueryTypes.UPDATE
        });
    },
    updateGroupVersion: function (groupId, timestamp) {
        return sequelize.query('UPDATE data_versions d JOIN group_members g ON d.userId = g.memberId AND g.groupId = ? AND g.isDeleted = 0 SET d.groupVersion = ?', {
            replacements: [groupId, timestamp],
            type: Sequelize.QueryTypes.UPDATE
        });
    },
    updateGroupMemberVersion: function (groupId, timestamp) {
        return sequelize.query('UPDATE data_versions d JOIN group_members g ON d.userId = g.memberId AND g.groupId = ? AND g.isDeleted = 0 SET d.groupVersion = ?, d.groupMemberVersion = ?', {
            replacements: [groupId, timestamp, timestamp],
            type: Sequelize.QueryTypes.UPDATE
        });
    }
};


//用户数据表的创建，后边数据表结构的修改，先在mysql编辑工具navicat中进行修改，然后再在代码中进行对应修改
User = sequelize.define('users', {
    id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    region: {
        type: Sequelize.STRING(5),
        allowNull: false,
        validate: {
            isInt: true //validate属性是用来添加验证，这些验证会在模型实例执行create、update和save自动执行，比如这里会自动验证这个字段值是不是整数
        }
    },
    phone: {
        type: Sequelize.STRING(11),
        allowNull: false,
        validate: {
            isInt: true
        }
    },
    nickname: {
        type: Sequelize.STRING(32),
        allowNull: false
    },
    portraitUri: {
        type: Sequelize.STRING(256),
        allowNull: false,
        defaultValue: ''
    },
    sex: {//新添字段性别，先在navicat中给数据库新增字段，再在这里根据类型对应定义
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
    },
    height: {//身高
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
    },
    birthday: {//出生日期，时间戳
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0
    },
    age: {//年龄
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: 0
    },
    freeImgList: {//新添字段免费图片列表，json数组的字符串
        type: Sequelize.TEXT,
        allowNull: true
        // defaultValue: '[]'//默认是个json数组的字符串，会报错？
    },
    feedback_rate: {//好评率
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true
    },
    longitude: {//经度
        type: Sequelize.DOUBLE,
        allowNull: true
    },
    latitude: {//纬度
        type: Sequelize.DOUBLE,
        allowNull: true
    },
    geohash: {//geohash字符串，用于匹配附近的人
        type: Sequelize.STRING(20),
        allowNull: true
    },
    location: {//位置信息，暂时用不到
        type: Sequelize.STRING(255),
        allowNull: true
    },
    suoZaiDi: {//所在地
        type: Sequelize.STRING(255),
        allowNull: true
    },
    followNum: {//关注数
        type: Sequelize.STRING(255),
        allowNull: true
    },
    fansNum: {//粉丝数
        type: Sequelize.STRING(255),
        allowNull: true
    },
    qianMing: {//签名
        type: Sequelize.TEXT,
        allowNull: true
    },
    xqah: {//兴趣爱好
        type: Sequelize.TEXT,
        allowNull: true
    },
    weChat: {//微信号
        type: Sequelize.STRING(64),
        allowNull: true
    },
    weChatPrice: {//微信号价格
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true
    },
    skills: {//Ta的技能，json字符串
        type: Sequelize.TEXT,
        allowNull: true
    },
    passwordHash: {
        type: Sequelize.CHAR(40),
        allowNull: false
    },
    passwordSalt: {
        type: Sequelize.CHAR(4),
        allowNull: false
    },
    rongCloudToken: {
        type: Sequelize.STRING(256),
        allowNull: false,
        defaultValue: ''
    },
    groupCount: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
    },
    timestamp: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '时间戳（版本号）'
    }
}, {
    classMethods: userClassMethods,
    paranoid: true,// （不是很理解）paranoid 属性只在启用 timestamps 时适用， 查询并加载软删除的数据，为true时，只会未删除的记录会返回，否则会返回删除和未删除的全部记录
    indexes: [ //添加索引
        {
            unique: true, //唯一索引，['region', 'phone'] 组合值只能出现一次
            fields: ['region', 'phone'] //多列索引，以区号和电话为索引，方便添加好友时，通过电话搜索用户？
        }
    ]
});

Blacklist = sequelize.define('blacklists', {
    id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    friendId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    status: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        comment: 'true: 拉黑'
    },
    timestamp: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '时间戳（版本号）'
    }
}, {
    indexes: [
        {
            unique: true,
            fields: ['userId', 'friendId']
        }, {
            method: 'BTREE',
            fields: ['userId', 'timestamp']
        }
    ]
});

Blacklist.belongsTo(User, {
    foreignKey: 'friendId',
    constraints: false
});

Friendship = sequelize.define('friendships', {
    id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    friendId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    displayName: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: ''
    },
    message: {
        type: Sequelize.STRING(64),
        allowNull: false
    },
    status: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        comment: '10: 请求, 11: 被请求, 20: 同意, 21: 忽略, 30: 被删除'
    },
    timestamp: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '时间戳（版本号）'
    }
}, {
    classMethods: friendshipClassMethods,
    indexes: [
        {
            unique: true,
            fields: ['userId', 'friendId']
        }, {
            method: 'BTREE',
            fields: ['userId', 'timestamp']
        }
    ]
});

Friendship.belongsTo(User, {
    foreignKey: 'friendId',
    constraints: false
});

Group = sequelize.define('groups', {
    id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: Sequelize.STRING(32),
        allowNull: false,
        comment: '最小 2 个字'
    },
    portraitUri: {
        type: Sequelize.STRING(256),
        allowNull: false,
        defaultValue: ''
    },
    memberCount: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
    },
    maxMemberCount: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 500
    },
    creatorId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    bulletin: {
        type: Sequelize.TEXT,
        allowNull: true
    },
    timestamp: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '时间戳（版本号）'
    }
}, {
    classMethods: groupClassMethods,
    paranoid: true,
    indexes: [
        {
            unique: true,
            fields: ['id', 'timestamp']
        }
    ]
});

GroupMember = sequelize.define('group_members', {
    id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    groupId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    memberId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    displayName: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: ''
    },
    role: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        comment: '0: 创建者, 1: 普通成员'
    },
    isDeleted: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    timestamp: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '时间戳（版本号）'
    }
}, {
    classMethods: groupMemberClassMethods,
    defaultScope: {
        where: {
            isDeleted: false
        }
    },
    indexes: [
        {
            unique: true,
            fields: ['groupId', 'memberId', 'isDeleted']
        }, {
            method: 'BTREE',
            fields: ['memberId', 'timestamp']
        }
    ]
});

GroupMember.belongsTo(User, {
    foreignKey: 'memberId',
    constraints: false
});

GroupMember.belongsTo(Group, {
    foreignKey: 'groupId',
    constraints: false
});

GroupSync = sequelize.define('group_syncs', {
    groupId: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true
    },
    syncInfo: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否需要同步群组信息到 IM 服务器'
    },
    syncMember: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否需要同步群组成员到 IM 服务器'
    },
    dismiss: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否需要在 IM 服务端成功解散群组'
    }
}, {
    timestamps: false
});

//一直不知道这个表是做什么用的，如果某个表的数据发生变化，都会调用一下这个表，更新这个表对应的字段
//其他表都在这个表有对应的字段，其他表有数据更新，会调用这个表更新对应的字段
DataVersion = sequelize.define('data_versions', {
    userId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true
    },
    userVersion: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '用户信息时间戳（版本号）'
    },
    blacklistVersion: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '黑名单时间戳（版本号）'
    },
    friendshipVersion: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '好友关系时间戳（版本号）'
    },
    groupVersion: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '群组信息时间戳（版本号）'
    },
    groupMemberVersion: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '群组关系时间戳（版本号）'
    }
}, {
    classMethods: dataVersionClassMethods,
    timestamps: false
});

VerificationCode = sequelize.define('verification_codes', {
    id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    region: {
        type: Sequelize.STRING(5),
        allowNull: false,
        primaryKey: true
    },
    phone: {
        type: Sequelize.STRING(11),
        allowNull: false,
        primaryKey: true
    },
    sessionId: {
        type: Sequelize.STRING(32),
        allowNull: false
    },
    token: {
        type: Sequelize.UUID,
        allowNull: false,
        defaultValue: Sequelize.UUIDV1,
        unique: true
    }
}, {
    indexes: [
        {
            unique: true,
            fields: ['region', 'phone']
        }
    ]
});

LoginLog = sequelize.define('login_logs', {
    id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    ipAddress: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    os: {
        type: Sequelize.STRING(64),
        allowNull: false
    },
    osVersion: {
        type: Sequelize.STRING(64),
        allowNull: false
    },
    carrier: {
        type: Sequelize.STRING(64),
        allowNull: false
    },
    device: {
        type: Sequelize.STRING(64)
    },
    manufacturer: {
        type: Sequelize.STRING(64)
    },
    userAgent: {
        type: Sequelize.STRING(256)
    }
}, {
    updatedAt: false
});

//订单表


//下面是新建的付费图片表
PayImgList = sequelize.define('pay_imgs', {
    id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    ownerId: { //外键，对应用户id，即图片拥有着，设置为索引，方便查询某个用户有哪些付费图片
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    imgUrl: {
        type: Sequelize.STRING(256),
        allowNull: false,
        defaultValue: ''
    },
    imgPrice: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    }
}, {
    classMethods: payImgListClassMethods, //可以在里面定义一些方法，方便调用，比如通过用户id查询该用户所有付费图片
    indexes: [
        {
            fields: ['ownerId'] //对用户id建立索引，方便查询某个用户有哪些付费图片
        }
    ]
});

//外键概念，简单学习网址 https://docs.microsoft.com/zh-cn/sql/relational-databases/tables/primary-and-foreign-key-constraints?view=sql-server-2017
PayImgList.belongsTo(User, {
    foreignKey: 'ownerId',
    constraints: true //建立外键约束？防止用户表User随意删除用户，付费图片表找不到对应的拥有该图片的用户
});

//下面是付费图片与用户之间的关系表，多对多关系，
// 简单学习网址 https://www.cnblogs.com/fengxuehuanlin/p/5325312.html，https://blog.csdn.net/WiteWater/article/details/53213285
//表示付费图片对应哪些用户是已经付费了的
PayImgAndUserList = sequelize.define('pay_imgs_and_users', {
    id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    userId: { //对应用户id
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    imgId: { //对应图片id
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    }
}, {
    classMethods: payImgAndUserListClassMethods,
    indexes: [
        {
            unique: true,
            fields: ['userId', 'imgId',]
        }, {
            fields: ['userId'] //对userId建立索引，方便快速查询该用户已付费图片
        }
    ]
});

//外键一
PayImgAndUserList.belongsTo(PayImgList, {
    foreignKey: 'imgId',
    constraints: true
});

//外键二
PayImgAndUserList.belongsTo(User, {
    foreignKey: 'userId',
    constraints: true
});

//微信付费表，记录哪些用户对哪些微信已经付费，以及微信的价格
PayWeChatAndUserList = sequelize.define('pay_wechat_and_users', {
    id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    userId: { //用户id
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    weChat: { //微信号
        type: Sequelize.STRING(64),
        allowNull: false,
        defaultValue: ''
    },
    weChatPrice: { //微信号价格
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
    }
}, {
    indexes: [
        {
            unique: true,
            fields: ['userId', 'wechat']
        }, {
            fields: ['userId']
        }
    ]
});

PayWeChatAndUserList.belongsTo(User, {
    foreignKey: 'userId',
    constraints: true
});

//交易记录表，给用户查看的，也可以看到我的收入
Order = sequelize.define('orders', {
    id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    payUserId: { //付款方用户id
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    receiveUserId: { //收款方用户id
        type: Sequelize.STRING(64),
        allowNull: false,
        defaultValue: ''
    },
    amount: { //付款金额
        type: Sequelize.DOUBLE.UNSIGNED,
        allowNull: false,
        defaultValue: 0
    },
    //应该还有交易类型，比如充值，约人付费，查看微信，查看图片，
    timestamp: {//时间戳
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '时间戳（版本号）'
    }
}, {
    indexes: [
        {
            fields: ['payUserId']
        }, {
            fields: ['receiveUserId']
        }
    ]
});

//马上租Ta，对应的订单数据表
MsztOrder = sequelize.define('mszt_orders', {
    id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    MsztOrderId: {
        //订单号，用于在客户端显示的订单号，字符串类型（怕20位超过了bigint类型），20位数字，在插入数据的时候，服务端计算生成，
        //10位的时间戳+10位的租户id（解析出来可能是个位数的），即同一秒内同一个租户不能同时生成2个订单
        //公式：10位时间戳 + 租户id（位数不够则补充0）（客户端传过来的是字符串，服务端解析成整数类型的id）
        type: Sequelize.STRING(25),
        allowNull: false
    },
    payUserId: { //付款方用户id，租方用户id
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    receiveUserId: { //收款方用户id，被租方用户id
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
    },
    status: {
        //订单状态，0：未付预付款，1：已付预付款待被租方接受，2：被租方已接受，待租方付全款，3：租方见到被租方，点击确认，4：双方无纠纷后48小时后将钱转给被租方
        //5：已退钱回给租方（已付预付款，被租方没有接受，全额退款），6：已退钱回给租方（被租方接受了，租方未付全款，扣除一定费用后退回给租方）
        //7：已退钱回给租方（点击确认后，租方和被租方后期发生纠纷，根据情况退钱回给被租方或被租方）
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
    },
    yysj: {
        //预约时间，时间戳，如果到这个时间后，被租房还未确认，则取消本订单，把钱按规则退回给租方，并发个消息推送过去
        //需要定时器，定时执行任务？要考虑到，如果中间服务器挂掉了，定时任务是需要重启还是怎么样
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0
    },
    yysc: {//预约时长
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
    },
    longitude: {//预约地点，经度
        type: Sequelize.DOUBLE,
        allowNull: false
    },
    latitude: {//预约地点，纬度
        type: Sequelize.DOUBLE,
        allowNull: false
    },
    yydd: {//预约地点
        type: Sequelize.STRING(255),
        allowNull: true
    },
    advancePayment: {//预付款金额
        type: Sequelize.DOUBLE.UNSIGNED,
        allowNull: false
    },
    totalPayment: {//总付款金额
        type: Sequelize.DOUBLE.UNSIGNED,
        allowNull: false
    },
    zffs: {//支付方式，0：钱包，1：微信，暂不考虑接入支付宝
        type: Sequelize.INTEGER,
        allowNull: false
    },
    yfkTs: {//付预付款时间，时间戳，单位为秒
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        defaultValue: 0,
    },
    jsTs: {//被租方接受时间，时间戳，待租方付全款
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        defaultValue: 0,
    },
    qrTs: {//租方点击确认时间，时间戳，租方见到被租方
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        defaultValue: 0,
    },
    zzTs: {//转账给被租方时间，双方无纠纷后48小时后将钱转给被租方
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        defaultValue: 0,
    },
    wjstkTs: {//全额退钱回给租方时间，已付预付款，被租方没有接受，全额退款
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        defaultValue: 0,
    },
    wfqktkTs: {//扣除一定费用后退钱回给租方时间,被租方接受了，租方未付全款，扣除一定费用后退回给租方
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        defaultValue: 0,
    },
    jftkTs: {//按规则退钱给租方或被租方时间,点击确认后，租方和被租方后期发生纠纷，根据情况退钱回给被租方或被租方
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        defaultValue: 0,
    },
}, {
    indexes: [
        {
            fields: ['MsztOrderId']
        }, {
            fields: ['payUserId']
        }, {
            fields: ['receiveUserId']
        }
    ]
});

//类的方法不能再像以前那样写了classMethods: verificationCodeClassMethods，而是像下面这样
VerificationCode.getByToken = function (token) {
    return VerificationCode.findOne({
        where: {
            token: token
        },
        attributes: ['region', 'phone']
    });
};

VerificationCode.getByPhone = function (region, phone) {
    return VerificationCode.findOne({
        where: {
            region: region,
            phone: phone
        },
        attributes: ['sessionId', 'token', 'updatedAt']
    });
};

//分割线，下面是新建表或者给表新建字段用的

MsztOrder.sync({alter: true}); //每加一个表时，把这句话放开，单独运行db.js就可以新增表

module.exports = [sequelize, User, Blacklist, Friendship, Group, GroupMember, GroupSync, DataVersion, VerificationCode, LoginLog, PayImgList, PayImgAndUserList,
    PayWeChatAndUserList, Order, MsztOrder];


// //下面时新建表的例子，
// const DbTestaa = sequelize.define('dbtestaa', {
//     firstName: {
//         type: Sequelize.STRING
//     },
//     lastName: {
//         type: Sequelize.STRING
//     },
//     imgUrl: {
//         type: Sequelize.STRING
//     },
//     userTo: {
//         type: Sequelize.STRING
//     }
// });
// // force: true 如果表已经存在，将会丢弃表
// DbTestaa.sync({ alter: true });

