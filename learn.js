const Sequelize = require('sequelize')

// create a sequelize instance
const sequelize = new Sequelize('yunchuang', 'root', 'Mysql123#', {
    host: '127.0.0.1',
    port: 3306,
    dialect: 'mysql',
    timezone: '+08:00',
    logging: null
});

// define the models
const BBcc = sequelize.define('bbcc', {
    name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
    },
    age: {
        type: Sequelize.INTEGER,
        defaultValue: 23
    },
    gender: {
        type: Sequelize.STRING,
        allowNull: true
    },
    abcdef: {
        type: Sequelize.STRING,
        allowNull: false
    }
})

const Post = sequelize.define('post', {
    title: {
        type: Sequelize.STRING,
        allowNull: false
    }
})

BBcc.create({
        name: 'John1',
    age: 26,
    gender: 'woman',
    abcdef: '12sa'
    });

// sync the models to db
// BBcc.sync({alter: true})
//     .then(() => console.log('Completed!'))