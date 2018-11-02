
//这个类后期千万不要执行，会直接删掉原来的表，如果要新建表或者修改表去db.js中执行相关命令

var sequelize;

sequelize = require('./src/db')[0];

console.log('Drop all schemas.');

sequelize.drop();

console.log('Sync all schemas.');

sequelize.sync({
// 创建表
// User.sync() 会创建表并且返回一个Promise对象
// 如果 force = true 则会把存在的表（如果users表已存在）先销毁再创建表
// 默认情况下 forse = false
  force: true
}).then(function() {
  return console.log('All done!');
})["catch"](function(err) {
  return console.log(err);
});
