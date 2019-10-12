# homebridge-shell-lock
A lock that can trigger shell commands.

# Configuration
Example config.json:

    {
        "platforms": [
            {
                "platform": "ShellLockPlatform",
                "cache_directory": "./.node-persist/storage", // (optional, default: "./.node-persist/storage")
                "locks": [
                    {
                        "id": "someLockId1",
                        "name": "Front Door",
                        "lockCommand": "ls -l",
                        "unlockCommand": "ps aux",
                        "autoLock": 5000 // (optional)
                    }
                ]
            }
        ]
    }
