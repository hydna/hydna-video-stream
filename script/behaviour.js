$(function(){
    
    var HYDNA_DOMAIN = 'testivara.hydna.net';
    
    var VIDEO_WIDTH = 320;
    var VIDEO_HEIGHT = 240;
    var QUALITY = .75;
    var FRAMERATE = 24;
    var DELAY = 1000/FRAMERATE;
    var VIDEO_INIT_DELAY = 1500;
    
    var VIDEO_CHANNEL_NUM = 1;
    var CHAT_CHANNEL_NUM = 2;
    var API_CHANNEL_NUM = 3;
    
    var context, canvas;
    var video_channel;
    var chat_channel;
    var api_channel;
    var video;
    var playback;
    var subtitle;
    var me;
    
    var broadcaster = false;
    
    function _nickgen() {
        var consonants = 'bcddfghklmmnnprssttv';
        var vocals = 'aaeeiioouuy';
        var length = 4 + Math.floor(Math.random() * 4);
        var nick = [];
        var pool;
        for (var i = 0; i < length; i++) {
            pool = (i % 2 ? vocals : consonants);
            nick.push(pool.charAt(Math.floor(Math.random() * pool.length)));
        }
        return nick.join('');
    }
    
    function _time(){
        var d = new Date();
        var h = d.getHours();
        var m = d.getMinutes();
        return (h < 12?'0' + h:h) + ':' + (m < 10?'0' + m:m);
    }
    
    function setup_broadcasting(callback){
        
        api_channel = new HydnaChannel(HYDNA_DOMAIN+"/"+API_CHANNEL_NUM, 'rw');
        api_channel.onopen = function(){
            console.log("api channel open...");
        }
        api_channel.onerror = function(e){
            console.log(e);
            api_channel.close();
            return callback(e);
        }
        
        api_channel.onsignal = function(e){
            
            console.log(e.message);
            console.log("receiving signal...");
            
            if(e.message == "dorment"){
                broadcaster = true;
            }
            
            api_channel.close();
            
            return callback(null, broadcaster);   
        }
    }
    
    function start_listening(broadcasting){
        console.log("lets do some broadcasting...");
        
        if(broadcasting){
            var passwd = prompt("Please provide broadcast password");
        }
        
        var mode = 'r';
        
        if(broadcasting){
            mode = 'rw';
        }
        
        var uri = HYDNA_DOMAIN+"/"+VIDEO_CHANNEL_NUM;
        
        if(broadcasting){
            uri += "/?"+passwd;
        }
                
        video_channel = new HydnaChannel(uri, mode);
        video_channel.onmessage = function(e){
            if(e.data.substr(0, 5) == "data:"){
                playback.src = e.data;
            }
        };
        
        video_channel.onopen = function(){
            
            console.log("initializing video connection...");
            
            if(broadcasting){
            
            	navigator.getUserMedia({video: true}, function(stream){
                    
                    video.src = window.URL.createObjectURL(stream);
                    
                    setTimeout(function(){
                        update_stream();
                        
                        subtitle.text("You are live!!");
                        
                    }, VIDEO_INIT_DELAY);
        
            	}, function(err){
                    console.log("Unable to get video stream!");
            	});
            }
        };
        
        video_channel.onerror = function(e){
            console.log(e.message);
            if(e.message == "wrongpassword"){
                alert('wrong password, please try again');
            }
        };
    }

    function init(){
        
        navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || navigator.oGetUserMedia;

        window.URL = window.URL || window.webkitURL;
        
        canvas = document.getElementById("drawing");
        canvas.width = VIDEO_WIDTH;
        canvas.height = VIDEO_HEIGHT;
        
        context = canvas.getContext("2d");
        
        playback = document.getElementById("playback");
        playback.width = VIDEO_WIDTH;
        playback.height = VIDEO_HEIGHT;
        
        var container = $('#container');
        container.css("width", VIDEO_WIDTH);
        container.css("left", "50%");
        container.css("margin-left",-Math.round(VIDEO_WIDTH*.5)+"px");
        container.css("top", "10%");
        
        var incoming = $('#incoming');
        
        subtitle = $('#subtitle');
        
        stats = new Stats();
        container.append(stats.domElement);
        
        video = document.getElementById("live");
        
        setup_broadcasting(function(err, broadcasting){
            
            if(err){
                alert("Error setting up, please try again");
                return;
            }
            
            if(broadcasting && !navigator.getUserMedia){
                broadcasting = false;
                
                alert("You have no support for broadcasting, you just have to watch");
            }
            
            if(!broadcasting){
                subtitle.text("");
                me = _nickgen();
            }else{
                me = "broadcaster";
            }
            
            start_listening(broadcasting);
            
        });

        
        chat_channel = new HydnaChannel(HYDNA_DOMAIN+"/"+CHAT_CHANNEL_NUM, 'rw');
        chat_channel.onmessage = function(e){
            
            try{
                var payload = JSON.parse(e.data);
                
                var thenick = payload.user.replace(/<([^>]+)>/g,'');
                var message = payload.msg.replace(/<([^>]+)>/g,'');
                
                if(thenick == "broadcaster"){
                    subtitle.text(message);
                }else{
                    incoming.prepend("<li>"+thenick+": "+message+"</li>");
                }
                
            }catch(e){}
               
        };
        
        chat_channel.onopen = function(){
            
            $("#msg_form").submit(function(e){
            
                e.preventDefault();
                var msg = $("#msg").val();
            
                if(msg.length > 0){
                    $("#msg").val("");
                    chat_channel.send(JSON.stringify({user:me, msg: msg}));
                }
            
                return false;
            
            });
        };
        
        chat_channel.onerror = function(e){
            console.log(e);
        };
    }
    
    function update_stream(){
        // Draw a frame of the live video onto the canvas
        context.drawImage(video, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
        
        var theimg = canvas.toDataURL("image/jpeg", QUALITY);
        
        // Check if size of data is wihtin the payload limit
        if (HydnaChannel.sizeOf(theimg) < HydnaChannel.MAXSIZE) {
            video_channel.send(theimg);
        }else{
            console.log("Cannot send image, just to big");
        }
        
        setTimeout(update_stream, DELAY);
        
        stats.update();
    }
    
    init();
    
});