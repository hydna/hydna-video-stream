/*
 * Todo
 * Show video instead of compressed img when broadcasting
 * connect to first in list automatically
 * disconnect to connecting if initiated other connect
 * freeze if video is coming online, ie connecting..
 * add message when disconnected by behavior
 * add count to streams
 * */

var videostream = {
    
    domain: "videostream.hydna.net",
    video_width: 320,
    video_height: 240,
    preview_width: 120,
    preview_height: 90,
    quality: .75,
    framerate: 12,
    delay: 1000/12,
    video_init_delay: 1500, 
    preview_delay: 5000,
    max_nick_length: 15,

    broadcasting: false,
    broadcasting_stream: null,
    broadcasting_uuid: "",

    streams: {},
    previews: {},
    
    selected_channel: null,
    selected_stream_id: null,
    selected_stream_name: null,

    streams_list_el: null,
    context: null,
    canvas_el: null,
    video_el: null,
    preview_context: null,
    preview_el: null,
    playback_el: null,
    broadcast_btn_el: null,
    live_indicator_el: null,
    subtitle_el: null,
    chat_el: null,
    submit_btn_el: null,

    connecting: false,
    supports_webcam: true,

    nick: "",

    init: function(){

        navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || navigator.oGetUserMedia;

        window.URL = window.URL || window.webkitURL;

        if(!navigator.getUserMedia){
            videostream.supports_webcam = false;
        }
        
        videostream.canvas_el = document.getElementById("drawing");
        videostream.canvas_el.width = videostream.video_width;
        videostream.canvas_el.height = videostream.video_height;
        
        videostream.context = videostream.canvas_el.getContext("2d");
        
        videostream.preview_el = document.createElement("canvas");
        videostream.preview_el.id = "preview_canvas";
        videostream.preview_el.width = videostream.preview_width;
        videostream.preview_el.height = videostream.preview_height;

        videostream.preview_context = videostream.preview_el.getContext("2d");

        videostream.playback_el = document.getElementById("playback");
        videostream.playback_el.width = videostream.video_width;
        videostream.playback_el.height = videostream.video_height;
        
        videostream.broadcast_btn_el = $("#broadcast_btn");
        videostream.broadcast_btn_el.prop("disabled", true);
        videostream.broadcast_btn_el.addClass("disabled");

        videostream.submit_btn_el = $("#submit_btn");
        videostream.submit_btn_el.addClass("disabled");

        videostream.live_indicator_el = $("#video-container .live");

        videostream.subtitle_el = $("#subtitle");
        videostream.show_message("Loading streams...");
        
        videostream.broadcast_btn_el.on("click", function(e){
            e.preventDefault();
            if(!videostream.broadcasting){
                videostream.broadcast();
                $(this).text("Stop broadcasting");

            }else{
                $(this).text("Broadcast yourself!");
            }

            $(this).prop("disabled", true);
            $(this).addClass("disabled");

        });

        if(!videostream.supports_webcam){
            videostream.broadcast_btn_el.hide();
        }
        
        videostream.video_el = document.getElementById("live");
        videostream.chat_el = $("#chat");
        videostream.streams_list_el = $("#streams");
        videostream.streams_list_el.on("click", "li", function(e){
            e.preventDefault();
            var uuid = $(this).attr("id");
            var name = $(this).data("name");
            if(videostream.broadcasting_uuid != uuid && videostream.selected_stream_id != uuid){
                videostream.connect_stream(uuid, name);
            }else{
                alert("You are already connected this stream");
            }
        });

        $("#msg_form").submit(function(e){
            e.preventDefault();
            var msg = $("#msg").val();
            videostream.send_chat(videostream.nick, msg);
            $("#msg").val("");
            $("#msg").focus();
        });

        videostream.connect_lobby();
    },

    terminate_broadcast: function(){
        if(videostream.broadcasting){
            videostream.broadcasting = false;
            videostream.broadcasting_stream.close();
            videostream.broadcasting_stream = null;

            $("#"+videostream.broadcasting_uuid).remove();

            videostream.broadcasting_uuid = "";
            videostream.connecting = false;

            videostream.live_indicator_el.fadeOut("fast");
        }
    },

    connect_stream: function(uuid, name){
        
        videostream.prompt_nick();

        videostream.terminate_broadcast();
        
        if(videostream.streams[uuid]){
            videostream.streams[uuid].close();
            videostream.streams[uuid] = null;
        }
        var channel = new HydnaChannel(videostream.domain + "/streams/" + uuid, "re");
        channel.onopen = function(event){
            
            console.log("connected to stream including me:"+event.data);

            videostream.chat_el.html("");
            videostream.display_chat(videostream.nick, "You are connected to '<strong>"+name+"'s</strong>' broadcast");
            
            channel.emit(JSON.stringify({nick: videostream.nick, type: "chat", data: "Joined the broadcast"}));

            videostream.show_message("Welcome!", true, false);

            videostream.submit_btn_el.removeClass("disabled");

            videostream.display_stream(uuid, name);
            
            $(videostream.streams_list_el, "li").removeClass("selected");
            $("#" + uuid, videostream.streams_list_el).addClass("selected");;
        }

        channel.onmessage = function(event){
            if(event.data.substr(0, 5) == "data:"){
                videostream.display_frame(event.data);
            }
        }

        channel.onsignal = function(event){
            
            var msg = videostream.parse_signal(event.data);

            switch(msg.type){
                            
                case "chat":
                    videostream.display_chat(videostream.clean_msg(msg.nick), videostream.clean_msg(msg.data));
                break;
                
                // TODO
                case "usercount":
                    console.log("usercount update...");    
                break;
                            
                case "preview":
                    videostream.display_preview(uuid, msg.data);
                break;
            }
        }

        channel.onclose = function(event){
            // TODO add handlers for error
            if(event.hadError){
                //console.log("Error");
            }else if(wasClean){
                // i closed this or someone else did...
            }
        }

        videostream.selected_channel = channel;
        videostream.selected_stream_id = uuid;
        videostream.selected_stream_name = name;
        videostream.streams[uuid] = channel;


    },

    connect_lobby: function(){
        var lobby_channel = new HydnaChannel(videostream.domain + "/streams", "r");
        lobby_channel.onopen = function(event){
             
            var list = [];

            if(event.data){
                list = event.data.split(",");
            }

            function parse_list_item(item){
                var parts = item.split(":");
                var id = parts.shift();
                var name = parts.join(":");
                return {id: id, name: name};
            }

            if(list.length > 0){
                
                if(list.length == 1){
                    var usr = parse_list_item(list[0]);
                    videostream.connect_stream(usr.id, usr.name);
                }else{
                    for(var i=0; i < list.length; i++){
                        
                        var usr = parse_list_item(list[i]);
                        
                        if(i == 0){
                            videostream.connect_stream(usr.id, usr.name);
                        }else{
                            videostream.listen_to_stream(usr.id, usr.name);
                        }
                    }
                }

            }else{
                // we have no streams right now, urge a broadcast
                // TODO urge broadcasting
            }
            
            videostream.broadcast_btn_el.prop("disabled", false);
            videostream.broadcast_btn_el.removeClass("disabled");
            
            if(videostream.supports_webcam){
                videostream.show_message("Ready to broadcast");
            }else{
                videostream.show_message("You browser does not support broadcasting your webcam, but you can always watch other peoples streams.");
            }
        }

        lobby_channel.onsignal = function(event){
            var msg = JSON.parse(event.data);
            switch(msg.type){
                case "chat":
                    //videostream.display_chat(msg.nick, msg.data);
                    break;
                case "preview":
                    break;
                case "del":
                    videostream.remove_stream(msg.id);
                    break;
                case "stream":
                    videostream.listen_to_stream(msg.id, msg.name);
                    break;
            }
        }
    },

    remove_stream: function(uuid){
        if(videostream.selected_stream_id == uuid){
            videostream.selected_stream_id = null;
            videostream.selected_channel = null;
        }

        if(videostream.streams[uuid]){
            videostream.streams[uuid].close();
        }

        $("#"+uuid, videostream.streams_list_el).remove();
    },

    listen_to_stream: function(uuid, name){

        if(!videostream.streams[uuid] && videostream.broadcasting_uuid != uuid){

            var mychannel = new HydnaChannel(videostream.domain + "/streams/" + uuid, "e");
            mychannel.onopen = function(event){
                videostream.display_stream(uuid, name);
            }

            mychannel.onsignal = function(event){
                var msg = videostream.parse_signal(event.data);
                
                switch(msg.type){
                    
                    case "chat":
                        videostream.display_chat(videostream.clean_msg(msg.nick), videostream.clean_msg(msg.data));
                    break;
                    
                    case "preview":
                        videostream.display_preview(uuid, msg.data);
                    break;

                }
            }   
    
            videostream.streams[uuid] = mychannel;
        }
    },

    update_stream: function(){
        // Draw a frame of the live video onto the canvas
        if(videostream.broadcasting){
            
            videostream.context.drawImage(videostream.video_el, 0, 0, videostream.video_width, videostream.video_height);
        
            var theimg = videostream.canvas_el.toDataURL("image/jpeg", videostream.quality);
            
            videostream.display_frame(theimg);

            // Check if size of data is wihtin the payload limit
            if (HydnaChannel.sizeOf(theimg) < HydnaChannel.MAXSIZE) {
                videostream.broadcasting_stream.send(theimg, 5);
            }        

            setTimeout(videostream.update_stream, videostream.delay);
        }
    },

    display_frame: function(data){
        videostream.playback_el.src = data;
    },

    display_preview: function(id, data){
        var theimg = $("img", "#"+id);
        theimg.attr("src", data);
        theimg.attr("width", videostream.preview_width);
        theimg.attr("height", videostream.preview_height);
    },
    
    display_chat: function(nick, msg){
        
        nick = videostream.clean_msg(nick);
        msg = videostream.clean_msg(msg);
        
        videostream.chat_el.append([
            '<li class="message">',
            '<span class="time">[',
            videostream.time(),
            ']</span>',
            '<span class="nick">',
            nick,
            ':</span>',
            msg,
            '</li>'
        ].join(''));

        videostream.chat_el.scrollTop(videostream.chat_el[0].scrollHeight);
    },

    send_preview: function(){

        if(videostream.broadcasting){
            
            videostream.preview_context.drawImage(videostream.canvas_el, 0, 0, videostream.video_width, videostream.video_height, 0, 0, videostream.preview_width, videostream.preview_height);

            var theimg = videostream.preview_el.toDataURL("image/jpeg", videostream.quality);
            videostream.broadcasting_stream.emit(JSON.stringify({type:"preview", data: theimg}));
            setTimeout(function(){
                videostream.send_preview();
            }, videostream.preview_delay);
        }
    },

    send_chat: function(nick, msg){
        var stream = null;
        if(videostream.broadcasting){
            stream = videostream.broadcasting_stream;
        }else{
            stream = videostream.selected_channel;
        }
        if(stream){
            stream.emit(JSON.stringify({nick: nick, type: "chat", data: msg}));
        }
    },

    broadcast: function(){
        
        if(!videostream.broadcasting){

            videostream.prompt_nick();

            videostream.show_message("Activating camera...", false, true);
            
            navigator.getUserMedia({video: true}, function(stream){
                    
                videostream.show_message("Preparing camera...", false, true);
                
                videostream.video_el.src = window.URL.createObjectURL(stream);
                
                setTimeout(function(){

                    videostream.show_message("Starting broadcast...", false, true);
                    
                    if(videostream.selected_channel){
                        videostream.selected_channel.close();
                        videostream.selected_channel = null;
               
                        videostream.listen_to_stream(videostream.selected_stream_id);
                    }

                    var uuid = videostream.guid(); 
                    
                    videostream.broadcasting = true;
                    videostream.broadcasting_uuid = uuid;

                    var channel = new HydnaChannel(videostream.domain + "/streams/" + uuid + "?" + videostream.nick, "we");
                    
                    channel.onopen = function(event){

                        videostream.broadcasting_stream = channel;
                        
                        videostream.update_stream();
                                
                        videostream.show_message("You are live!!", true);
                        videostream.send_preview();
                                
                        videostream.display_stream(uuid, videostream.nick);

                        videostream.live_indicator_el.fadeIn("slow");

                        videostream.display_chat(videostream.nick, "You are now broadcasting!");
                        
                        videostream.submit_btn_el.removeClass("disabled");

                    }

                    channel.onsignal = function(event){
                        
                        var msg = videostream.parse_signal(event.data);

                        switch(msg.type){
                            case "preview":
                                videostream.display_preview(uuid, msg.data);
                            break;
                            case "chat":
                                $("#"+uuid+" a span").text(msg.data);
                                videostream.display_chat(videostream.clean_msg(msg.nick), videostream.clean_msg(msg.data));
                            break;
                        }
                    }

                    channel.onclose = function(event){
                        if(event.hadError){
                            // TODO restore to not broadcasting
                        }
                    }

                    videostream.selected_channel = channel;
                    videostream.selected_stream_id = uuid;

                }, videostream.video_init_delay);
    
                }, function(err){

                    videostream.show_message("You need to allow camera to broadcast");

                    videostream.broadcasting = false;
                }
            );
            
        }
    },
    
    display_stream: function(uuid, name){
        if($("#"+uuid, videostream.streams_list_el).length == 0){ 
            videostream.streams_list_el.append("<li id='"+uuid+"' data-name='"+name+"'><a href='#'><img src=''></a><span class='name'>"+name+"</span><div class='msg'><span></span></div></li>");
        }
    },

    show_message: function(text, hide, spinner){
        $("span", videostream.subtitle_el).text(text);
        
        videostream.subtitle_el.removeClass("loading");

        if(spinner){
            videostream.subtitle_el.addClass("loading");
        }

        videostream.subtitle_el.css("margin-top", -(videostream.subtitle_el.outerHeight()*.5));
        videostream.subtitle_el.fadeIn();
        
        if(hide){
            setTimeout(function(){
                videostream.hide_message();
            }, 2000);
        }
    },

    hide_message: function(){
        videostream.subtitle_el.fadeOut("fast");
    },

    clean_msg: function(msg){
        // escape nicks and messages to prevent evil users from doing evil things
        return msg.replace(/<([^>]+)>/g,'');
    },

    prompt_nick: function(){
        if(!videostream.nick){
            
            var generated = videostream.nickgen();

            var person = prompt("Please enter your name", generated);
            
            var clean = "";

            if (person!=null){
                clean = videostream.clean_msg(person);
            }else{
                clean = generated;
            }

            if(clean.length > videostream.max_nick_length){
                clean = clean.substr(0, videostream.max_nick_length);
            }

            videostream.nick = clean;
        }
    },

    parse_signal: function(data){
        var msg = {};
        try{
            msg = JSON.parse(data);
        }catch(e){
        }

        return msg;
    },

    guid: function(){
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    },

    nickgen: function() {
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
    },
    
    time: function(){
        var d = new Date();
        var h = d.getHours();
        var m = d.getMinutes();
        return (h < 12?'0' + h:h) + ':' + (m < 10?'0' + m:m);
    }
};

$(document).ready(function(){
    videostream.init();
});
