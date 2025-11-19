import { frontPageEn } from './en.js';
import { frontPageZh } from './zh.js';

export async function frontpage() {
    console.log(`Fetching front page data...`);
    await frontPageEn();
    await frontPageZh();
}