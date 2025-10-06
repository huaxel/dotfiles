local icons = require("icons")
local colors = require("colors")
local settings = require("settings")

local battery = sbar.add("item", "widgets.battery", {
    position = "right",
    icon = {
        font = {
            style = settings.font.style_map["Regular"],
            size = 19.0
        }
    },
    label = {
        font = {
            family = settings.font.numbers
        }
    },
    update_freq = 180,
    popup = {
        align = "center"
    }
})

battery:subscribe({"routine", "power_source_change", "system_woke"}, function()
    sbar.exec("pmset -g batt", function(batt_info)
        local icon = "!"
        local label = "?"

        local found, _, charge = batt_info:find("(%d+)%%")
        if found then
            charge = tonumber(charge)
            label = charge .. "%"
        end

        local color = colors.green
        local charging, _, _ = batt_info:find("AC Power")

        if charging then
            icon = icons.battery.charging
        else
            if found and charge > 80 then
                icon = icons.battery._100
            elseif found and charge > 60 then
                icon = icons.battery._75
            elseif found and charge > 40 then
                icon = icons.battery._50
            elseif found and charge > 20 then
                icon = icons.battery._25
                color = colors.orange
            else
                icon = icons.battery._0
                color = colors.red
            end
        end

        local lead = ""
        if found and charge < 10 then
            lead = "0"
        end

        battery:set({
            icon = {
                string = icon,
                color = color
            },
            label = {
                string = lead .. label
            }
        })
    end)
end)

local device_list = sbar.add("item", {
    position = "popup." .. battery.name,
    icon = {
        string = "Devices:",
        width = 90,
        align = "left"
    },
    label = {
        width = 200,
        align = "left",
        font = {
            family = settings.font.text,
            size = 12.0
        }
    }
})

battery:subscribe("mouse.clicked", function(env)
    local drawing = battery:query().popup.drawing
    local new_state = drawing == "on" and "off" or "on"
    
    if new_state == "off" then
        -- Remove device items when closing popup
        for i = 1, 10 do
            pcall(function()
                sbar.remove("device_" .. i)
            end)
        end
    end

    battery:set({
        popup = {
            drawing = new_state
        }
    })

    if new_state == "on" then
        sbar.exec("/usr/local/bin/airbattery -c", function(csv_output)
            local devices = {}
            local lines = {}

            -- Split output into lines
            for line in csv_output:gmatch("[^\r\n]+") do
                table.insert(lines, line)
            end

            -- Skip the header line and parse each device
            for i = 2, #lines do
                local line = lines[i]
                local device, level_str, status = line:match("([^,]+),([^,]+),([^,]+)")

                if device and level_str and status then
                    -- Clean up the data
                    device = device:match("^%s*(.-)%s*$") -- trim whitespace
                    level_str = level_str:match("^%s*(.-)%s*$") -- trim whitespace
                    status = status:match("^%s*(.-)%s*$") -- trim whitespace

                    -- Extract numeric level (remove % sign)
                    local level = tonumber(level_str:match("(%d+)"))

                    if level then
                        table.insert(devices, {
                            name = device,
                            level = level,
                            status = status
                        })
                    end
                end
            end

            -- Remove any existing device items
            for i = 1, 10 do -- Assume max 10 devices
                pcall(function()
                    sbar.remove("device_" .. i)
                end)
            end

            -- Check if we found any devices
            if #devices == 0 then
                device_list:set({
                    label = "No devices found"
                })
                return
            end

            -- Create separate items for each device
            for i, dev in ipairs(devices) do
                local color_indicator = ""
                local level_color = colors.green -- Default color

                if dev.level <= 20 then
                    level_color = colors.red
                elseif dev.level <= 40 then
                    level_color = colors.orange
                elseif dev.level <= 60 then
                    level_color = colors.yellow
                else
                    level_color = colors.green
                end

                -- Choose battery icon based on level (similar to main battery)
                local battery_icon = ""
                if dev.status == "+" then -- charging
                    battery_icon = icons.battery.charging
                else
                    if dev.level > 80 then
                        battery_icon = icons.battery._100
                    elseif dev.level > 60 then
                        battery_icon = icons.battery._75
                    elseif dev.level > 40 then
                        battery_icon = icons.battery._50
                    elseif dev.level > 20 then
                        battery_icon = icons.battery._25
                    else
                        battery_icon = icons.battery._0
                    end
                end

                sbar.add("item", "device_" .. i, {
                    position = "popup." .. battery.name,
                    icon = {
                        string = battery_icon,
                        color = level_color,
                        width = 25
                    },
                    label = {
                        string = dev.name .. ": " .. dev.level .. "%",
                        color = level_color,
                        font = {
                            family = settings.font.text,
                            size = 12.0
                        }
                    }
                })
            end
        end)
    end
end)

sbar.add("bracket", "widgets.battery.bracket", {battery.name}, {
    background = {
        color = colors.bg1,
        border_color = colors.rainbow[#colors.rainbow - 2],
        border_width = 1
    }
})

sbar.add("item", "widgets.battery.padding", {
    position = "right",
    width = settings.group_paddings
})
