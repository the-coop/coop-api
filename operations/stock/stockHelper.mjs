import { 
	joinVoiceChannel,
	createAudioPlayer,
	createAudioResource,
	entersState,
	StreamType,
	AudioPlayerStatus,
	VoiceConnectionStatus,
    NoSubscriberBehavior
} from '@discordjs/voice';
import axios from "axios";
import { CHANNELS, ROLES, SERVER } from '../../organisation/coop.mjs';

export default class StockHelper {

    static US_OPEN = false;

    static async update() {
        console.log('stockhelper update');
        const now = new Date;

        now.setTime(now.getTime() + now.getTimezoneOffset() * 60 * 1000);

        const estOffset = -300; // Timezone offset for EST in minutes.
        const estDate = new Date(now.getTime() + estOffset * 60 * 1000);

        // Check if weekday.
        const isESTWeekday = ![0, 6].includes(estDate.getDay());

        // The NYSE is open from Monday through Friday 9:30 a.m. to 4:00 p.m. Eastern time.
        const afterOpen = (estDate.getHours() === 9 && estDate.getMinutes() >= 30) || estDate.getHours() > 10;
        const beforeClose = estDate.getHours() < 4;

        console.log('isESTWeekday', isESTWeekday);
        console.log('afterOpen', afterOpen);
        console.log('beforeClose', beforeClose);
        console.log('US_OPEN', this.US_OPEN);

        if (isESTWeekday) {

            if (!this.US_OPEN && afterOpen) {
                this.US_OPEN = true;
                
                // Ping opt in role.
                // CHANNELS._send('STOCKS_VC_TEXT', `${ROLES._textRef('MARKET_OPEN_PING')}, NYSE market open - good luck!`, {});

                // Give them 15 seconds to join before announcing after ping so they can catch it.
                setTimeout(() => {
                    // this.announce();
                }, 15000);
            }
    
            if (this.US_OPEN && !beforeClose) {
                this.US_OPEN = false;
    
                // Announce open at the end until another file created (testing).
                // this.announce();
            }
        }
    }

    static async announce() {
        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause
            }
        });
        
        const channel = CHANNELS._getCode('STOCKS_VC');

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            debug: true
        });
    
        await entersState(connection, VoiceConnectionStatus.Ready, 30e3);

        connection.subscribe(player);

        const url = 'https://www.thecoop.group/marketopen.mp3';

        // const resource = createAudioResource(url, {
        //     inputType: StreamType.Arbitrary
        // });

        const resource = createAudioResource(url);

        player.play(resource);
    
        entersState(player, AudioPlayerStatus.Playing, 5e3);
        
        // const botChan = CHANNELS._get('974458778495905872')

        // botChan.send('!clear-queue');
        // botChan.send(`!play ${url}`);
        
        // !clear-queue
        // !play ${url}


    }
}