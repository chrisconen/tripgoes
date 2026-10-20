// Local development/test adapter only. Production imports the D1 binding directly.
import {DatabaseSync} from 'node:sqlite';
export function createSqlite(path){
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
 function prepare(sql,args=[]){return {
  bind(...values){return prepare(sql,values)},
  async first(column){const row=db.prepare(sql).get(...args)??null;return column?(row?.[column]??null):row},
  async all(){return {success:true,results:db.prepare(sql).all(...args)}},
  async run(){const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}}},
  sql,args
 }}
 return {prepare,exec:sql=>db.exec(sql),close:()=>db.close(),async batch(statements){
  db.exec('BEGIN IMMEDIATE');
  try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results}
  catch(error){db.exec('ROLLBACK');throw error}
 }};
}
