-- Spike: polls for a stop file named by MYMAME_STOP_FILE (every 6 frames, also while paused);
-- when it appears, remove it and exit MAME cleanly so cfg/nvram are saved.
local stop_file = os.getenv("MYMAME_STOP_FILE")
local frames = 0
_G.mymame_stop_sub = emu.add_machine_frame_notifier(function()
  frames = frames + 1
  if frames % 6 ~= 0 or not stop_file then return end
  local f = io.open(stop_file, "r")
  if f then f:close(); os.remove(stop_file); manager.machine:exit() end
end)
