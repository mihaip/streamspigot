class _ConstantsDict(dict):
    def __getattr__(self, m):
        return self[m]
        
CONSTANTS = _ConstantsDict(
    BACKGROUND_COLOR='#8aa7ff',
    BACKGROUND_DARKER_COLOR='#7094ff',
    ANCHOR_COLOR='#2db300',
    
    USER_LINK_COLOR='#333',
    BUBBLE_COLOR='#f6f6f6',
    BUBBLE_REPLY_COLOR='#e6e6e6',
    BUBBLE_TEXT_COLOR='#41419b',
    BUBBLE_SEPARATOR_COLOR='#d6E0ff',
    HEADER_COLOR='#666',
    
    APP_NAME='Stream Spigot',
    APP_URL='http://www.streamspigot.com/',
)
