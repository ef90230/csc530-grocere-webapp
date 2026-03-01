# csc530-grocere-webapp
This repo contains the code and content for Grocer-E, a web app designed to manage and fulfill online orders in a similar vein to Walmart's Global Integrated Fulfillment (GIF) software and other apps. This project was created as part of the Murray State University Senior Software Project.

## Set Up Your Store
Store managers can rearrange the aisles and path that pickers use to collect items for orders. You can even use AI to devise a path for you.
### What Makes a Store Efficient?
At major retailers, aisles are organized in a way to group similar items together. While the paths that customers take when shopping in-person vary a lot, it's critical that pickers are as fast as possible when collecting items off the salesfloor. Faster picking means lower wait times and less backlog for other employees waiting to sort and dispense orders. As such, a good pick path minimizes backtracking while addressing every possible aisle location in the store. For instance, a picker would not want to skip an aisle and come back to it without a very good reason to do so.

<img width="421" height="471" alt="pickpathexample" src="https://github.com/user-attachments/assets/f6e1af12-57c5-43a6-931b-c523f94b23de" />

## Fulfill Orders With Ease

## Get Feedback For Your Work
Grocer-E tracks store and employee fulfillment metrics to give you instant feedback on performance. From pick rate to wait times and beyond, Grocer-E gives your store powerful tools to fuel your operations decisions.
### Track Item Issues and Correct Them
To power Grocer-E's powerful algorithmic paths, stores are set up with a database of item locations by aisle. You can search and filter through these item listings to locate common issues, such as items sold out.
- By aisle/section - The default. Use this to check aisles one by one.
- By item category - Identifies items from one department that may be scanned into the area of a different, wrong, department.
- No locations only - Identifies items with no known location that may be difficult to locate in pick walks and when customers shop.
- Alphabetical order and reverse alphabetical order - Locate a specific item by name if you can’t remember the exact name for the search bar.
- Reverse On Hand order - Identifies items out of stock or close to out of stock.
### Metric Definitions
- Pick Rate - The rate per hour at which items are shopped.
- First-Time Pick % (FTP) - The percent of items found at the first opportunity during a pick walk. Even if an item is found without substituting, if the employee scanned the wrong item beforehand, it is a failure for this metric's purposes.
- Pre-Substitution % - The percent of items ordered fulfilled by the original item only.
- Post-Substitution % - The percent of items ordered fulfilled either by the original item or a substitute.
- On-Time % - The percent of items shopped without going overdue.
- Weighted Efficiency - A special score assigned as an aggregate of the employee/store's pick rate and FTP. A perfect score results from a pick rate >= 100.00 items/hour and FTP of 100%.

## CRUD Pipelines and Other Documentation
