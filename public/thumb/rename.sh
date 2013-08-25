x=0
for file in *.jpg; do    
((x++))
mv "$file" "$x.jpg"
done
