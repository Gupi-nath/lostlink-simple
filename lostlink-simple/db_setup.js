// db_setup.js – Run once to create the MySQL database and tables.
// Usage: node db_setup.js

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const config = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || 'ABcd12&&@@',
  multipleStatements: true,
};

async function main() {
  console.log('🔌 Connecting to MySQL...');
  const conn = await mysql.createConnection(config);

  console.log('📦 Creating database "lostlink"...');
  await conn.query('CREATE DATABASE IF NOT EXISTS lostlink CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await conn.query('USE lostlink');

  console.log('🏗  Creating tables...');
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(200) NOT NULL,
      email         VARCHAR(200) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role          ENUM('student','admin') NOT NULL DEFAULT 'student',
      phone         VARCHAR(50),
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS items (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      user_id          INT NOT NULL,
      type             ENUM('lost','found') NOT NULL,
      title            VARCHAR(300) NOT NULL,
      description      TEXT,
      category         VARCHAR(100) NOT NULL,
      location         VARCHAR(300) NOT NULL,
      event_date       DATE NOT NULL,
      verify_question  VARCHAR(500),
      status           ENUM('open','claimed','returned') NOT NULL DEFAULT 'open',
      created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS claims (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      item_id      INT NOT NULL,
      claimant_id  INT NOT NULL,
      answer       VARCHAR(500) NOT NULL,
      status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      note         TEXT,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at  DATETIME,
      FOREIGN KEY (item_id)     REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (claimant_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Seed demo data if users table is empty
  const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM users');
  if (c === 0) {
    console.log('🌱 Inserting seed data...');
    const today = new Date().toISOString().slice(0, 10);

    const [r1] = await conn.query(
      'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?,?,?,?,?)',
      ['Campus Admin', 'admin@lostlink.test', bcrypt.hashSync('admin123', 10), 'admin', '01700000000']
    );
    const [r2] = await conn.query(
      'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?,?,?,?,?)',
      ['Demo Student', 'student@lostlink.test', bcrypt.hashSync('student123', 10), 'student', '01700000001']
    );
    const [r3] = await conn.query(
      'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?,?,?,?,?)',
      ['Rafi Ahmed', 'rafi@lostlink.test', bcrypt.hashSync('student123', 10), 'student', '01700000002']
    );

    const addItem = (uid, type, title, desc, cat, loc, date, vq) =>
      conn.query(
        'INSERT INTO items (user_id, type, title, description, category, location, event_date, verify_question) VALUES (?,?,?,?,?,?,?,?)',
        [uid, type, title, desc, cat, loc, date, vq]
      );

    await addItem(r2.insertId, 'found', 'Black earbuds case',       'Found on a bench near the library entrance.', 'Electronics',   'Central Library',     today, 'What brand is printed on the case?');
    await addItem(r2.insertId, 'found', 'Student ID card',          'Blue lanyard attached. Found in Room 204.',   'ID & Cards',    'Academic Building A', today, 'Which department is written on the card?');
    await addItem(r3.insertId, 'lost',  'Green steel water bottle', 'Mountain sticker on the side.',               'Water Bottles', 'Cafeteria',           today, null);
    await addItem(r3.insertId, 'lost',  'Data Structures notebook', 'Red spiral notebook with name on first page.','Books & Notes', 'Lab 3',               today, null);

    console.log('✅ Seed data inserted.');
  } else {
    console.log('ℹ️  Users table already has data — skipping seed.');
  }

  await conn.end();
  console.log('\n🎉 Database setup complete!');
  console.log('   Now run:  node server.js');
}

main().catch(err => {
  console.error('\n❌ Setup failed:', err.message);
  process.exit(1);
});
