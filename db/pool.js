import pg from 'pg';
import config from '../config/index.js';

const { Pool } = pg;

export const pool = new Pool(config.database);

export const query = (text, values) => pool.query(text, values);
