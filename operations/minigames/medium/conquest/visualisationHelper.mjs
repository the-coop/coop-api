import axios from 'axios';
import { createWriteStream, readFile } from 'fs';


export default class VisualisationHelper {

    static screencast_url = 'https://chrome.browserless.io/screencast'

    static read(path) {
        return readFile(path, 'utf8', (err, data) => {
            if (err) return console.error(err);
            console.log(data);
        });
    }

    static save(data, outputPath) {
        return new Promise((resolve, reject) => {
            const writer = data.pipe(createWriteStream(outputPath));
            writer.on('finish', () => {
                console.log('Successfully downloaded file!');
                resolve(true);
            });
        });
    }

    static async record(url, duration = 50000) {
        const response = await axios.post(`${this.screencast_url}?token=${process.env.BROWSERLESS_TOKEN}&--window-size=1920,1080`,
            {
                "code": "module.exports = async function main({ page, context }) { await page.setViewport({ width: context.width, height: context.height, deviceScaleFactor: 1 }); await page.goto(context.url); await page.waitFor(context.wait);}",
                "context": {
                    "url": url,
                    "wait": duration,
                    "width": 1920,
                    "height": 1080
                }
            },
            {
                responseType: 'stream',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        await this.save(response.data, '/tmp/video.webm');

        // Complete.
        return true;
    }
    
}