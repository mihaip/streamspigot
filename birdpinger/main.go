package main

import (
	"flag"
	"fmt"

	"twitterstream"
)

var twitterUsername *string = flag.String("twitter_username", "", "Twitter account username to use to connect to the Streaming API")
var twitterPassword *string = flag.String("twitter_password", "", "Password for the Twitter account")

func main() {
	flag.Parse()

	if len(*twitterUsername) == 0 || len(*twitterPassword) == 0 {
		flag.Usage()
		return
	}

	stream := make(chan *twitterstream.Tweet)
	client := twitterstream.NewClient(*twitterUsername, *twitterPassword)
	err := client.Sample(stream)
	if err != nil {
		fmt.Println(err.String())
	}
	for {
		tw := <-stream
		fmt.Println(tw.User.Screen_name, ": ", tw.Text)
	}
}
