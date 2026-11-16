Here are our orders as CSV:

```
customer,item,qty,unit_price
Acme,Widget,10,2.50
Birch,Gadget,3,10.00
Acme,Gadget,2,10.00
Cedar,Widget,40,2.50
Birch,Widget,4,2.50
Cedar,Gizmo,1,99.99
Dune,Widget,5,2.50
Acme,Gizmo,1,99.99
```

Make totals.csv in the working folder with one row per customer and the columns customer,total, where total is the sum of qty times unit_price, with two decimals, largest total first.
