var BROADCAST_PASSWD = "hydnaiscool";
var BROADCAST_CHANNEL = 1;
var CHAT_CHANNEL = 2;
var API_CHANNEL = 3;

hydna.onopen = function(request, channel, connection, domain) {
    
    if(channel.id == BROADCAST_CHANNEL){
        if(request.token.length > 0){
            // so we want to broadcast            
            if(request.token == BROADCAST_PASSWD){
                if(!request.mode.contains('r')){ // check so they can write
                    return request.deny('You need to write to broadcast');
                }
                
                domain.get('broadcaster', function(err, val){
                    if(err || val == connection.id){
                        
                        // there is no broadcaster set
                        domain.set('broadcaster', connection.id);
                        
                        return request.allow('You are welcome to broadcast');
                    }
                    
                    return request.deny('The broadcast position is taken');
                });
            }else{
                return request.deny('wrongpassword');
            }
            
        }else{ // so we just want to listen
            
            // check if they want to write
            if(request.mode.contains('w')){
                return request.deny('You are not allowed to broadcast');
            }
            
            return request.allow('You are welcome to watch');
        }
    }
    
    if(channel.id == API_CHANNEL){ // heck
        domain.get('broadcaster', function(err, val){
            if(!err){
                channel.emit('broadcasting');
            }else{
                channel.emit('dorment');
            }
        });
        
        return request.allow();
    }
    
    if(channel.id == CHAT_CHANNEL){
        
        
        
        return request.allow();
    }
};

hydna.onclose = function(channel, connection, domain){
    if(channel.id == BROADCAST_CHANNEL){
        
        // check to see if this user is the broadcaster
        domain.get('broadcaster', function(err, val){
            if(!err){
                if(connection.id == val){ // if he is, delete broadcaster
                    domain.del('broadcaster');
                }
            }
        });
    }
}