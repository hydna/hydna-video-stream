const ADMIN_TOKEN = '!<admin-token>';

const ENTRY_POINT = '/streams';

const KEY_CHANNELS = 'channels:';
const KEY_COUNT = 'usercount';
const KEY_ADMIN = 'admin';
const KEY_STREAM = 'stream';
const KEY_DELSTREAM = 'del';


register('videostream-lobby', {

    open: function (event) {
        event.channel.findall(KEY_CHANNELS + '*', function (err, keys) {
            // err is currenly always <null>
            keys = keys.sort();
            event.allow(keys.join(','));
        });
    }
});


register('videostream-channel', {
    
    open: function (event) {
        var channel = event.channel;
        var connid = String(event.connection.id);
        var lobby = event.domain.getChannel(ENTRY_POINT);
        var channelid = event.params.id;
        var channelkey = KEY_CHANNELS + channelid;

        function ASSERT (err) {
            if (err) {
                event.deny('ERR: ' + err);
            }
        }

        function isAdminChannel () {
            return channelid.substr(0, ADMIN_TOKEN.length) !== ADMIN_TOKEN;
        }

        // We are using special charachters in matching in other places,
        // so we need to validate channel id.
        if (/,|\s/.test(channelid) || (!isAdminChannel() && channelid[0] == '!')) {
            event.deny('ERR: Invalid channel id');
        }

        switch (true) {

            // Open channel as a broadcaster. Deny request if channel
            // already exists in lobby
            case event.write && event.emit && !event.read:
                lobby.get(channelkey, function (err, adminid) {
                    if (err != 'not found') {
                        ASSERT(err);
                    }

                    if (adminid != null) {
                        ASSERT('Already broadcasting');
                    }

                    channel.incr(KEY_COUNT, function (err, count) {
                        ASSERT(err);

                        channel.set("admin", connid, function (err) {

                            ASSERT(err);

                            lobby.set(channelkey, channelid + ":" + event.token, function (err) {
                                ASSERT(err);

                                channel.emit(JSON.stringify({
                                    type: KEY_COUNT,
                                    count: count           
                                }));

                                lobby.emit(JSON.stringify({
                                    type: KEY_STREAM,
                                    id: channelid,
                                    name: event.token
                                }));

                                event.allow(String(count));
                            });
                  
                        });

                    });

                }); 
            
            break;


            // Open channel in subscriber mode. We do not check if channel
            // exist, just allow it with a count on number of users currently
            // watching the broadcast.
            default:
            case event.read && event.emit:
                channel.incr(KEY_COUNT, function (err, count) {
                    ASSERT(err);

                    channel.emit(JSON.stringify({
                        type: KEY_COUNT,
                        count: count           
                    }));

                    event.allow(String(count));
                });
            break;
        }
    },
    
    emit: function (event) {
        var channel = event.channel;
        channel.emit(event.data);
    },
    
    close: function (event) {
        var channel = event.channel;
        var connid = String(event.connection.id);
        var lobby = event.domain.getChannel(ENTRY_POINT);
        var channelkey = KEY_CHANNELS + event.params.id;

        channel.decr(KEY_COUNT, function (err, count) {

            if (err) {
                return;
            }

            // Check if we are broadcast user, if so, delete
            // key, or if user count is 0.
            channel.get("admin", function (err, adminid) {
                if (err) {
                    return;
                }

                if (count == 0 || adminid == connid) {
                    lobby.del(channelkey);
                    lobby.emit(JSON.stringify({
                        type: KEY_DELSTREAM,
                        id: event.params.id
                    }));
                }

                channel.emit(JSON.stringify({
                    type: KEY_COUNT,
                    count: count           
                }));
            });
        });
    }
});


behavior(ENTRY_POINT, 'videostream-lobby');
behavior(ENTRY_POINT + '/{id}', 'videostream-channel');
