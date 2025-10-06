local icons = require("icons")
local colors = require("colors")
local settings = require("settings")

-- Execute the event provider binary which provides the event "network_update"
-- for the network interface "en0", which is fired every 2.0 seconds.
sbar.exec(
    "killall network_load >/dev/null; $CONFIG_DIR/helpers/event_providers/network_load/bin/network_load en0 network_update 2.0")

local wifi_up = sbar.add("item", "widgets.wifi1", {
    position = "right",
    padding_left = -5,
    width = 0,
    icon = {
        padding_right = 0,
        font = {
            style = settings.font.style_map["Bold"],
            size = 9.0
        },
        string = icons.wifi.upload
    },
    label = {
        font = {
            family = settings.font.numbers,
            style = settings.font.style_map["Bold"],
            size = 9.0
        },
        color = colors.red,
        string = "??? Bps"
    },
    y_offset = 4
})

local wifi_down = sbar.add("item", "widgets.wifi2", {
    position = "right",
    padding_left = -5,
    icon = {
        padding_right = 0,
        font = {
            style = settings.font.style_map["Bold"],
            size = 9.0
        },
        string = icons.wifi.download
    },
    label = {
        font = {
            family = settings.font.numbers,
            style = settings.font.style_map["Bold"],
            size = 9.0
        },
        color = colors.blue,
        string = "??? Bps"
    },
    y_offset = -4
})

local wifi = sbar.add("item", "widgets.wifi.padding", {
    position = "right",
    label = {
        drawing = false
    }
})

-- Background around the item
local wifi_bracket = sbar.add("bracket", "widgets.wifi.bracket", {wifi.name, wifi_up.name, wifi_down.name}, {
    background = {
        color = colors.bg1,
        border_color = colors.rainbow[#colors.rainbow - 4],
        border_width = 1
    },
    popup = {
        align = "center",
        height = 30
    }
})

sbar.add("item", {
    position = "right",
    width = settings.group_paddings
})

wifi_up:subscribe("network_update", function(env)
    local up_color = (env.upload == "000 Bps") and colors.grey or colors.red
    local down_color = (env.download == "000 Bps") and colors.grey or colors.blue
    wifi_up:set({
        icon = {
            color = up_color
        },
        label = {
            string = env.upload,
            color = up_color
        }
    })
    wifi_down:set({
        icon = {
            color = down_color
        },
        label = {
            string = env.download,
            color = down_color
        }
    })
end)

wifi:subscribe({"wifi_change", "system_woke"}, function(env)
    sbar.exec("ipconfig getifaddr en0", function(ip)
        local connected = not (ip == "")
        wifi:set({
            icon = {
                string = connected and icons.wifi.connected or icons.wifi.disconnected,
                color = connected and colors.white or colors.red
            }
        })
    end)
end)

local function hide_details()
    wifi_bracket:set({
        popup = {
            drawing = false
        }
    })
end

local function toggle_details()
    -- Remove old items
    for _, item in ipairs(sbar.items()) do
        if item.name:match("^widgets%.wifi%.network%.") then
            sbar.remove(item.name)
        end
    end

    -- Run airport scan
    sbar.exec("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s", function(output)
        if not output or output == "" then
            sbar.add("item", "widgets.wifi.network.error", {
                position = "popup." .. wifi.name,
                popup = { drawing = true },
                label = { string = "Unable to scan networks", align = "center" }
            })
            return
        end

        local lines = {}
        for line in output:gmatch("[^\r\n]+") do
            table.insert(lines, line)
        end

        for i = 2, math.min(#lines, 8) do
            local ssid = lines[i]:match("^%s*(.-)%s+%-?%d+%s+dBm")
            local rssi = lines[i]:match("%-?%d+%s+dBm")

            if ssid and rssi then
                local name = ssid:gsub("%s+", "_")
                sbar.add("item", "widgets.wifi.network." .. name, {
                    position = "popup." .. wifi.name,
                    popup = { drawing = true },
                    icon = { string = "", align = "left" },
                    label = { string = ssid .. " (" .. rssi .. ")", align = "right" }
                })
            end
        end

        -- Add link to system preferences
        sbar.add("item", "widgets.wifi.network.settings", {
            position = "popup." .. wifi.name,
            popup = { drawing = true },
            icon = { string = "⚙️", align = "left" },
            label = { string = "Open Network Settings", align = "right" },
            click_script = "open 'x-apple.systempreferences:com.apple.preference.network'"
        })
    end)

    wifi_bracket:set({ popup = { drawing = true } })
end

wifi_up:subscribe("mouse.clicked", toggle_details)
wifi_down:subscribe("mouse.clicked", toggle_details)
wifi:subscribe("mouse.clicked", toggle_details)
wifi:subscribe("mouse.exited.global", hide_details)
