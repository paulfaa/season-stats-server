const query = `
You are an expert in extracting structured data from images. You will parse the data from the image, and return it in a json format according to these instructions:
The uploaded image will contain the results of a playlist. These include the following important properties: the name of the playlist, the number of events in the playlist, the name of each player, the scores of each player in the final event, and the overall scores of each player.

You will parse the image, and return a message in the form of a JSON blob containing the parsed data. This should have a structure like

{
    playlistName: 'Test Playlist',
    numberOfEvents: 12,
    numberOfPlayers: 8,
    players: [
      {
        name: 'Player 1',
        lastEventPoints: 15,
        totalPoints: 153,
      },
      {
        name: 'Player 2',
        lastEventPoints: 12,
        totalPoints: 144,
      }
    ]
  }

Here are some important things to note regarding the image:
The title always appears in the top left of the image, and has the following format: 'Playlist - name - X of X '
Populate the playlistName field of the response json - with the title, removing the 'Playlist - ' prefix and the ' - X of X' suffix.
(The total number of events will always be provided in the format X of X, where X always is equal to X. For example, 13 of 13)

The center of image contains a table with the details of each player, and their results. The table is ordered from highest overall points to lowest.
The table will always have a header row, which contains the following 8 columns from left to right:
First column: POSITION
Second column: PLAYER LEVEL - this column is always missing a header. It contains the level of the corresponding player, which is not relevant to this task. ALWAYS completely ignore the values in this column. DO NOT map this value to the totalPoints field in the response.
The following 4 columns will be titled X-Y where X is the event number, and Y is the total amount of events, eg. 10-12 would be the title of the 10th event of a playlist which has 12 events in total.
Of these 4 X-Y columns, the data should be sourced from the final one, where Y=Y, eg 12-12, which should be used to populate the lastEventPoints field for each corresponding player in the response. It is not possible to score over 16 points in the final event.
The sixth column is titled OVERALL, and contains the total points each player has scored in the playlist. This maps to totalPoints in the response. Do NOT map this value to the lastEventPoints field in the response. It is not possible to score over 200 points, if you see a value over 200, you are looking at the player's level, not their total points. Do not include any values over 200 in the response.
The final column is titled NEXT, and doesn't contain any relevant data for this task.

The POSITION column contains between 2 and 3 elements, from left to right:
The first and leftmost element is the overall position of the player in the playlist, which is always a number (1,2,3,4,5). This is not relevant to the task.
The second element is the name of the player, which will always be one from the following list - ['BarizztaButzy', 'mikc95', 'meas_taibhse', 'iiCiaran', 'cooooney95', 'kendy232', 'hurling1', 'jackw2610', 'galwayboy7', 'cwolin']
This name maps to the name field of the player in the response.
Sometimes there will be a third element, which is small white square with a clan tag like 'GSMF' displayed immediately after the player name, these should be ignored and not confused with the player's name.

If you do not have an extremely high degree of certainty for a particular value, it should be replaced with null or 0 where appropriate.
`

export { query };